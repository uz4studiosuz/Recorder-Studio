import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { withTimeout } from '../shared/async.js';

const require = createRequire(import.meta.url);
export function ffmpegPath(): string {
  const binary = require('ffmpeg-static') as string | null;
  if (!binary) throw new Error('FFmpeg is not available on this platform');
  return binary.replace('app.asar', 'app.asar.unpacked');
}
export async function checkFFmpeg() {
  try { await access(ffmpegPath()); } catch { throw new Error('FFmpeg binary is missing. Run npm rebuild ffmpeg-static, then rebuild the app.'); }
}
export function launch(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(ffmpegPath(), ['-hide_banner', '-y', ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
}
export function completion(child: ChildProcessWithoutNullStreams): Promise<void> {
  let tail = '';
  child.stdout.resume();
  child.stderr.on('data', data => { tail = (tail + data.toString()).slice(-8000); });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${tail.slice(-1800)}`)));
  });
}
export async function runFFmpeg(args: string[], options?: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (seconds: number) => void }) {
  await checkFFmpeg();
  if (options?.signal?.aborted) throw new Error('Recording finalization cancelled. Raw files are preserved.');
  const child = launch(options?.onProgress ? ['-progress', 'pipe:1', ...args] : args);
  const done = completion(child); let failure: Error | undefined;
  const stop = (message: string) => { failure = new Error(message); child.kill(); };
  const abort = () => stop('Recording finalization cancelled. Raw files are preserved.');
  let idle: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(idle); if (options) idle = setTimeout(() => stop('FFmpeg stopped responding. Raw files are preserved.'), 45000); };
  let progressBuffer = '';
  if (options?.onProgress) child.stdout.on('data', data => {
    touch(); progressBuffer += data.toString(); const lines = progressBuffer.split('\n'); progressBuffer = lines.pop() ?? '';
    for (const line of lines) if (line.startsWith('out_time_us=')) { const seconds = Number(line.slice(12)) / 1e6; if (Number.isFinite(seconds)) options.onProgress!(seconds); }
  });
  options?.signal?.addEventListener('abort', abort, { once: true }); touch();
  if (options?.signal?.aborted) abort();
  const timer = options ? setTimeout(() => stop('Finalization time limit reached. Raw files are preserved.'), options.timeoutMs ?? 120000) : undefined;
  try { await done; if (failure) throw failure; } catch (error) { throw failure ?? error; }
  finally { clearTimeout(timer); clearTimeout(idle); options?.signal?.removeEventListener('abort', abort); }
}
export async function mediaDuration(file: string) {
  const child = launch(['-i', file]); let log = '';
  child.stderr.on('data', data => { log = (log + data.toString()).slice(-16000); });
  try { await withTimeout(completion(child).catch(() => {}), 15000, 'Media duration probe timed out. Raw files are preserved.'); }
  finally { if (child.exitCode === null) child.kill(); }
  const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (!match) throw new Error('Recorded screen has no readable duration. Raw files are preserved.');
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
export async function hasAudio(file: string) {
  const child = launch(['-i', file]);
  let log = ''; child.stdout.resume();
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-12000); });
  await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
  return /Audio:/.test(log);
}

export type Encoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264';
let hardware: Promise<Encoder> | undefined;
/** Finds a working GPU H.264 encoder once per session; falls back to x264. */
export function hardwareEncoder() {
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
/**
 * Real-time encoding for live capture and recording finalization. GPU encoders keep up with 60fps
 * at any resolution, so Stop no longer waits for a CPU encoder backlog to drain.
 */
export function fastVideoArgs(encoder: Encoder, gop: number) {
  switch (encoder) {
    case 'h264_nvenc': return ['-pix_fmt', 'yuv420p', '-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'll', '-rc', 'constqp', '-qp', '19', '-bf', '0', '-g', String(gop)];
    case 'h264_qsv': return ['-pix_fmt', 'nv12', '-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '21', '-bf', '0', '-g', String(gop)];
    case 'h264_amf': return ['-pix_fmt', 'yuv420p', '-c:v', 'h264_amf', '-usage', 'lowlatency', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '19', '-qp_p', '21', '-bf', '0', '-g', String(gop)];
    default: return ['-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '18', '-g', String(gop)];
  }
}

/** Size of the first video stream, read from FFmpeg's input summary. */
export async function videoSize(file: string) {
  const child = launch(['-i', file]); let log = ''; child.stdout.resume();
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-16000); });
  await withTimeout(new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); }), 15000, 'Video probe timed out');
  const match = /Video:.*?(d{2,5})x(d{2,5})/.exec(log);
  if (!match) throw new Error('No video stream');
  return { width: Math.floor(Number(match[1]) / 2) * 2, height: Math.floor(Number(match[2]) / 2) * 2 };
}
