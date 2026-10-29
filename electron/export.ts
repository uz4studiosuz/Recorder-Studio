import { app, dialog, clipboard, ClipboardItem, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { RecorderAPI } from '../shared/api.js';
import { checkFFmpeg, completion, hasAudio, launch } from './ffmpeg.js';
import { mediaPath } from './media.js';
import { dragGestures, chalkSample } from '../shared/pointer-audio.js';
import { outputDuration, outputAtSource, timelineRanges, settingsAt } from '../shared/timeline.js';

interface Job { id: string; child: ChildProcessWithoutNullStreams; done: Promise<void>; temporary: string; output: string; frames: number; expected: number; frameBytes: number; error?: Error; writing: boolean; copyToClipboard: boolean; clicksFile?: string; filterFile?: string }
let job: Job | null = null;
let lastOutput: string | undefined;
export async function revealExport() { if (lastOutput) shell.showItemInFolder(lastOutput); }
type Encoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264';
let hardware: Promise<Encoder> | undefined;
/** Finds a working GPU H.264 encoder once per session; falls back to x264. */
function hardwareEncoder() {
  hardware ??= (async () => {
    for (const encoder of ['h264_nvenc', 'h264_qsv', 'h264_amf'] as const) {
      const child = launch(['-f', 'lavfi', '-i', 'color=black:s=1280x720:d=0.2', '-frames:v', '3', '-vf', encoder === 'h264_qsv' ? 'format=nv12' : 'format=yuv420p', '-c:v', encoder, '-f', 'null', '-']);
      const timer = setTimeout(() => child.kill(), 8000);
      try { await completion(child); return encoder; } catch { /* try the next encoder */ } finally { clearTimeout(timer); }
    }
    return 'libx264' as const;
  })();
  return hardware;
}
function videoArgs(encoder: Encoder, crf: number, width: number) {
  const color = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const filter = (format: string) => ['-vf', `scale=out_color_matrix=bt709:out_range=tv,format=${format}`];
  switch (encoder) {
    case 'h264_nvenc': return [...filter('yuv420p'), '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + 1), '-b:v', '0', '-spatial-aq', '1', ...color];
    case 'h264_qsv': return [...filter('nv12'), '-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(crf + 2), ...color];
    case 'h264_amf': return [...filter('yuv420p'), '-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf + 2), ...color];
    default: return [...filter('yuv420p'), '-c:v', 'libx264', '-preset', width > 2560 ? 'veryfast' : 'faster', '-crf', String(crf), '-threads', '0', ...color];
  }
}
export async function startExport(input: Parameters<RecorderAPI['startExport']>[0]) {
  if (job) throw new Error('An export is already active');
  const { width, height, fps, settings, format } = input;
  if (![width, height, fps].every(Number.isFinite) || width < 64 || width > 3840 || height < 64 || height > 3840 || width % 2 || height % 2 || ![15, 20, 24, 30, 60].includes(fps) || !['mp4', 'gif'].includes(format)) throw new Error('Invalid export dimensions or frame rate');
  if (input.crf !== undefined && (!Number.isInteger(input.crf) || input.crf < 14 || input.crf > 35)) throw new Error('Invalid compression quality');
  const duration = outputDuration(settings), ranges = timelineRanges(settings);
  if (duration <= 0 || duration > 4 * 3600 || (format === 'gif' && duration > 60)) throw new Error('Export duration must be positive; GIF is limited to 60 seconds.');
  await checkFFmpeg();
  const source = mediaPath(input.mediaId);
  if (input.destination !== undefined && !['file', 'clipboard'].includes(input.destination)) throw new Error('Invalid export destination');
  const cache = path.join(app.getPath('videos'), 'Recorder Studio', 'Exports');
  if (input.destination === 'clipboard') await fs.mkdir(cache, { recursive: true });
  const selected = input.destination === 'clipboard' ? { canceled: false, filePath: path.join(cache, `Recording-${Date.now()}-${randomUUID()}.${format}`) } : await dialog.showSaveDialog({ title: 'Export video', defaultPath: `Recorder Studio.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (selected.canceled || !selected.filePath) return null;
  const output = selected.filePath.toLowerCase().endsWith(`.${format}`) ? selected.filePath : `${selected.filePath}.${format}`;
  const id = randomUUID(); const temporary = `${output}.${id}.partial.${format}`;
  if (input.encoder !== undefined && !['auto', 'cpu'].includes(input.encoder)) throw new Error('Invalid encoder');
  // Raw RGBA frames: no PNG encode in the renderer and no PNG decode in FFmpeg.
  const args = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0'];
  const audio = format === 'mp4' && await hasAudio(source);
  let graph = '';
  if (audio) {
    args.push('-i', source);
    if (ranges.length > 1) graph = `[1:a]asplit=${ranges.length}${ranges.map((_, index) => `[input${index}]`).join('')};`;
    // Each clip keeps its own volume; the project volume is applied once below.
    const clipVolume = (start: number, end: number) => settingsAt({ ...settings, volume: 1 }, (start + end) / 2).volume;
    graph += ranges.map((range, index) => `[${ranges.length > 1 ? `input${index}` : '1:a'}]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS,volume=${clipVolume(range.start, range.end)}[a${index}]`).join(';');
    graph += `;${ranges.map((_, index) => `[a${index}]`).join('')}concat=n=${ranges.length}:v=0:a=1,${tempo(settings.speed)},volume=${settings.volume}[base]`;
  }
  let clicksFile: string | undefined;
  if (format === 'mp4' && settings.clickSounds) {
    const clicks = input.telemetry.filter(event => event.kind === 'mousedown' && ranges.some(range => event.timeMs / 1000 >= range.start && event.timeMs / 1000 < range.end));
    clicksFile = `${temporary}.clicks.wav`;
    const drags = dragGestures(input.telemetry).flatMap(drag => ranges.flatMap(range => { const start = Math.max(drag.start, range.start), end = Math.min(drag.end, range.end); return end > start ? [{ start: range.outputStart + (start - range.start) / settings.speed, end: range.outputStart + (end - range.start) / settings.speed }] : []; }));
    await clickTrack(clicksFile, duration, clicks.map(event => outputAtSource(settings, event.timeMs / 1000)), drags);
    args.push('-i', clicksFile);
    const index = audio ? 2 : 1;
    graph += `${graph ? ';' : ''}[${index}:a]anull[taps]`;
    graph += audio ? ';[base][taps]amix=inputs=2:normalize=0[outaudio]' : ';[taps]anull[outaudio]';
  } else if (audio) graph += ';[base]anull[outaudio]';
  let filterFile: string | undefined;
  if (graph) { filterFile = `${temporary}.filters`; await fs.writeFile(filterFile, graph); args.push('-filter_complex_script', filterFile); }
  args.push('-map', '0:v:0');
  if (graph) args.push('-map', '[outaudio]', '-c:a', 'aac', '-b:a', '192k');
  const encoder: Encoder = format === 'mp4' && input.encoder !== 'cpu' ? await hardwareEncoder() : 'libx264';
  if (format === 'mp4') args.push(...videoArgs(encoder, input.crf ?? 18, width), '-movflags', '+faststart');
  else args.push('-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', '0');
  const expected = Math.ceil(duration * fps);
  args.push('-frames:v', String(expected), '-t', String(expected / fps), temporary);
  const child = launch(args); const done = completion(child);
  const state: Job = { id, child, done, temporary, output, frames: 0, expected, frameBytes: width * height * 4, writing: false, copyToClipboard: input.destination === 'clipboard', clicksFile, filterFile };
  void done.catch(error => { state.error = error; });
  child.stdin.on('error', error => { state.error = error; });
  job = state; return { id, encoder: format === 'gif' ? 'gif' : encoder };
}
function tempo(speed: number) {
  const values: number[] = [];
  while (speed > 2) { values.push(2); speed /= 2; }
  while (speed < 0.5) { values.push(0.5); speed /= 0.5; }
  return [...values, speed].map(value => `atempo=${value}`).join(',');
}
function active(id: string) { if (!job || job.id !== id) throw new Error('Export job no longer exists'); return job; }
export async function exportFrame(id: string, data: ArrayBuffer) {
  const state = active(id);
  if (state.error) throw state.error;
  if (state.writing || state.frames >= state.expected) throw new Error('Unexpected export frame');
  if (data.byteLength !== state.frameBytes) throw new Error('Export frame has the wrong size');
  state.writing = true;
  try { await new Promise<void>((resolve, reject) => state.child.stdin.write(Buffer.from(data), error => error ? reject(error) : resolve())); state.frames++; }
  finally { state.writing = false; }
}
export async function finishExport(id: string) {
  const state = active(id);
  try {
    if (state.frames !== state.expected) throw new Error(`Missing frames: ${state.frames}/${state.expected}`);
    state.child.stdin.end(); await state.done;
    await fs.rename(state.temporary, state.output); lastOutput = state.output;
    if (state.copyToClipboard) {
      try { await clipboard.write([new ClipboardItem({ 'text/uri-list': pathToFileURL(state.output).href })]); }
      catch { throw new Error(`Export saved to ${state.output}, but the clipboard was unavailable. Copy the file from that folder.`); }
    }
    return state.output;
  } catch (error) { state.child.kill(); await fs.rm(state.temporary, { force: true }); throw error; }
  finally { if (state.clicksFile) await fs.rm(state.clicksFile, { force: true }); if (state.filterFile) await fs.rm(state.filterFile, { force: true }); job = null; }
}
export async function cancelExport(id?: string) {
  if (!job || (id && job.id !== id)) return;
  const state = job; job = null;
  state.child.kill(); await state.done.catch(() => {}); await fs.rm(state.temporary, { force: true });
  if (state.clicksFile) await fs.rm(state.clicksFile, { force: true });
  if (state.filterFile) await fs.rm(state.filterFile, { force: true });
}
async function clickTrack(file: string, duration: number, times: number[], drags: { start: number; end: number }[]) {
  const rate = 48000, samples = Math.ceil(duration * rate), bytes = samples * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(bytes + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(bytes, 40);
  const handle = await fs.open(file, 'w');
  try {
    await handle.write(header); await handle.truncate(44 + bytes);
    for (const time of times) {
      const start = Math.max(0, Math.round(time * rate)), count = Math.min(720, samples - start);
      if (count <= 0) continue;
      const tap = Buffer.alloc(count * 2);
      for (let index = 0; index < count; index++) tap.writeInt16LE(Math.round(Math.sin(index / rate * 1600 * Math.PI * 2) * Math.exp(-index / 110) * 4500), index * 2);
      await handle.write(tap, 0, tap.length, 44 + start * 2);
    }
    for (const drag of drags) { const start = Math.round(drag.start * rate), count = Math.min(samples - start, Math.round((drag.end - drag.start) * rate));
      for (let offset = 0; offset < count; offset += 4096) { const length = Math.min(4096, count - offset), block = Buffer.alloc(length * 2);
        for (let sample = 0; sample < length; sample++) block.writeInt16LE(Math.round(chalkSample(offset + sample, rate, count / rate) * 32767), sample * 2);
        await handle.write(block, 0, block.length, 44 + (start + offset) * 2);
      }
    }
  } finally { await handle.close(); }
}
