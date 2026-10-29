import { desktopCapturer, screen, systemPreferences, globalShortcut, BrowserWindow } from 'electron';
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CaptureResult, CaptureTarget, CaptureOptions } from '../shared/api.js';
import type { TelemetryEvent } from '../shared/project.js';
import { checkFFmpeg, completion, launch, runFFmpeg, mediaDuration } from './ffmpeg.js';
import { withTimeout } from '../shared/async.js';
import { registerMedia, sessionFolder } from './media.js';

const require = createRequire(import.meta.url);
type Hook = typeof import('uiohook-napi').uIOhook;
interface Recording {
  folder: string; process: ChildProcessWithoutNullStreams; done: Promise<void>;
  origin: number; hook: Hook; log: WriteStream; first: boolean; count: number;
  bounds: { x: number; y: number; width: number; height: number };
  tracks: Map<string, WriteStream>; error?: string; stopping: boolean;
  handlers: Array<[string, (event: any) => void]>;
  draining?: boolean; stage?: string; progress?: number; abort: AbortController;
}
let recording: Recording | null = null;
let starting = false;
let lastError: string | undefined;
let lastFolder: string | undefined;
let targetCache = new Map<string, { target: CaptureTarget; input: string[]; bounds: Recording['bounds'] }>();
let rectReader: ((id: string) => Recording['bounds']) | undefined;

function windowBounds(id: string): Recording['bounds'] {
  if (rectReader) return rectReader(id);
  const koffi = require('koffi') as typeof import('koffi');
  const user32 = koffi.load('user32.dll');
  const rect = koffi.struct('RecorderWindowRect', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  const getRect = user32.func('bool __stdcall GetClientRect(void *hwnd, _Out_ RecorderWindowRect *rect)');
  koffi.struct('RecorderPoint', { x: 'long', y: 'long' });
  const toScreen = user32.func('bool __stdcall ClientToScreen(void *hwnd, _Inout_ RecorderPoint *point)');
  rectReader = windowId => {
    const value = { left: 0, top: 0, right: 0, bottom: 0 }, origin = { x: 0, y: 0 };
    const hwnd = BigInt(windowId.split(':')[1]);
    if (!getRect(hwnd, value) || !toScreen(hwnd, origin)) throw new Error('The selected window is no longer available');
    return { x: origin.x, y: origin.y, width: value.right - value.left, height: value.bottom - value.top };
  };
  void rect;
  return rectReader(id);
}
export async function targets(): Promise<CaptureTarget[]> {
  await checkFFmpeg();
  targetCache = new Map();
  if (process.platform === 'win32') {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 270 } });
    const displays = screen.getAllDisplays();
    displays.forEach((display, index) => {
      const bounds = screen.dipToScreenRect(null, display.bounds);
      const source = sources.find(source => source.display_id === String(display.id));
      const target: CaptureTarget = { id: `screen:${display.id}`, name: display.label || `Display ${index + 1}`, kind: 'screen', width: bounds.width, height: bounds.height, thumbnail: source?.thumbnail.toDataURL() };
      targetCache.set(target.id, { target, bounds, input: ['-f', 'gdigrab', '-framerate', '60', '-draw_mouse', '0', '-offset_x', String(bounds.x), '-offset_y', String(bounds.y), '-video_size', `${bounds.width}x${bounds.height}`, '-i', 'desktop'] });
    });
    const windows = sources.filter(source => source.id.startsWith('window:'));
    for (const source of windows) {
      if (source.name === 'Recorder Studio') continue;
      let bounds; try { bounds = windowBounds(source.id); } catch { continue; }
      if (bounds.width < 32 || bounds.height < 32) continue;
      const target: CaptureTarget = { id: source.id, name: source.name, kind: 'window', width: bounds.width, height: bounds.height, thumbnail: source.thumbnail.toDataURL() };
      if (windows.filter(item => item.name === source.name).length > 1) continue;
      targetCache.set(target.id, { target, bounds, input: ['-f', 'gdigrab', '-framerate', '60', '-draw_mouse', '0', '-i', `title=${source.name}`] });
    }
  } else if (process.platform === 'darwin') {
    const child = launch(['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
    let log = ''; child.stdout.resume(); child.stderr.on('data', chunk => { log += chunk; });
    await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
    const screens = [...log.matchAll(/\[(\d+)\] Capture screen (\d+)/g)];
    for (const [index, match] of screens.entries()) {
      const display = screen.getAllDisplays()[index]; if (!display) continue;
      const bounds = { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height };
      const thumbs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 480, height: 270 } });
      const target: CaptureTarget = { id: `mac:${match[1]}`, name: display.label || `Display ${index + 1}`, kind: 'screen', width: bounds.width, height: bounds.height, thumbnail: thumbs[index]?.thumbnail.toDataURL() };
      targetCache.set(target.id, { target, bounds, input: ['-f', 'avfoundation', '-framerate', '60', '-capture_cursor', '0', '-i', `${match[1]}:none`] });
    }
  } else throw new Error('Native recording currently supports Windows and macOS.');
  return [...targetCache.values()].map(item => item.target);
}
export async function startCapture(id: string, onStop: () => void, options?: CaptureOptions) {
  if (recording || starting) throw new Error('A recording is already active');
  const target = targetCache.get(id); if (!target) throw new Error('Choose a capture source again');
  if (target.target.kind === 'window') target.bounds = windowBounds(id);
  const originalBounds = { ...target.bounds };
  const region = options?.region;
  let cropFilter = '';
  if (region) {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1.00001 || region.y + region.height > 1.00001) throw new Error('Invalid capture region');
    const left = Math.round(region.x * originalBounds.width / 2) * 2, top = Math.round(region.y * originalBounds.height / 2) * 2;
    const width = Math.floor(Math.min(originalBounds.width - left, region.width * originalBounds.width) / 2) * 2;
    const height = Math.floor(Math.min(originalBounds.height - top, region.height * originalBounds.height) / 2) * 2;
    if (width < 64 || height < 64) throw new Error('Capture region must be at least 64 × 64 pixels');
    cropFilter = `crop=${width}:${height}:${left}:${top},`;
    target.bounds = { x: originalBounds.x + left, y: originalBounds.y + top, width, height };
  }
  if (target.bounds.width < 16 || target.bounds.height < 16) throw new Error('Selected window is minimized or too small');
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) throw new Error('Enable Accessibility access for Recorder Studio in System Settings, then retry.');
  starting = true; lastError = undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  let log: WriteStream | undefined;
  let hook: Hook | undefined;
  try {
    await checkFFmpeg();
    hook = (require('uiohook-napi') as typeof import('uiohook-napi')).uIOhook;
    const folder = await sessionFolder();
    log = createWriteStream(path.join(folder, 'telemetry.json')); log.write('[');
    child = launch([...target.input, '-vf', cropFilter + 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-g', '60', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(folder, 'raw.mp4')]);
    const done = completion(child); void done.catch(() => {});
    lastFolder = folder;
    const state: Recording = { folder, process: child, done, origin: Infinity, hook, log, first: true, count: 0, bounds: target.bounds, tracks: new Map(), handlers: [], stopping: false, stage: 'Recording', abort: new AbortController() };
    child.stderr.on('data', chunk => {
      if (!Number.isFinite(state.origin) && /Input #0/.test(chunk.toString())) {
        state.origin = performance.now();
        const dip = screen.getCursorScreenPoint(); const point = process.platform === 'win32' ? screen.dipToScreenPoint(dip) : dip;
        state.log.write(JSON.stringify({ timeMs: 0, x: (point.x - state.bounds.x) / state.bounds.width, y: (point.y - state.bounds.y) / state.bounds.height, kind: 'move' }));
        state.first = false; state.count++;
      }
    });
    log.on('error', error => { state.error = error.message; state.process.stdin.write('q'); });
    recording = state;
    child.stdin.on('error', error => { state.error = error.message; });
    let lastMove = -100;
    for (const kind of ['move', 'mousedown', 'mouseup'] as const) {
      const eventName = kind === 'move' ? 'mousemove' : kind;
      const handler = (event: { x: number; y: number }) => {
        if (state.stopping || state.error) return;
        const timeMs = performance.now() - state.origin;
        if (!Number.isFinite(timeMs) || timeMs < 0) return;
        if (target.target.kind === 'window') { try { const moving = windowBounds(id); if (moving.width <= 0 || moving.height <= 0) return; state.bounds.x = moving.x + (region ? Math.round(region.x * originalBounds.width / 2) * 2 : 0); state.bounds.y = moving.y + (region ? Math.round(region.y * originalBounds.height / 2) * 2 : 0); } catch { return; } }
        if (kind === 'move' && (timeMs - lastMove < 1000 / 60 || state.log.writableNeedDrain)) return;
        if (kind === 'move') lastMove = timeMs;
        if (++state.count > 2_000_000) { state.error = 'Recording telemetry limit reached'; state.process.stdin.write('q'); return; }
        const eventData: TelemetryEvent = { timeMs, x: (event.x - state.bounds.x) / state.bounds.width, y: (event.y - state.bounds.y) / state.bounds.height, kind };
        state.log.write((state.first ? '' : ',') + JSON.stringify(eventData)); state.first = false;
      };
      state.handlers.push([eventName, handler]); hook.on(eventName as 'mousemove', handler);
    }
    if (options?.keystrokes) {
      const names = keyNames((require('uiohook-napi') as typeof import('uiohook-napi')).UiohookKey);
      const handler = (event: import('uiohook-napi').UiohookKeyboardEvent) => {
        if (state.stopping || state.error) return;
        const timeMs = performance.now() - state.origin, label = keyLabel(names, event);
        if (!label || !Number.isFinite(timeMs) || timeMs < 0 || state.log.writableNeedDrain) return;
        if (++state.count > 2_000_000) { state.error = 'Recording telemetry limit reached'; state.process.stdin.write('q'); return; }
        const eventData: TelemetryEvent = { timeMs, x: -1, y: -1, kind: 'key', key: label };
        state.log.write((state.first ? '' : ',') + JSON.stringify(eventData)); state.first = false;
      };
      state.handlers.push(['keydown', handler]); hook.on('keydown', handler);
    }
    hook.start();
    // Wait until the input opens; fail immediately on FFmpeg or capture-device errors.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Screen capture did not start within 15 seconds')); }, 15000);
      const onData = (chunk: Buffer) => { if (/Output #0|frame=/.test(chunk.toString())) { cleanup(); resolve(); } };
      const cleanup = () => { clearTimeout(timer); child!.stderr.off('data', onData); };
      child!.stderr.on('data', onData);
      void done.then(() => { cleanup(); reject(new Error('Capture ended during startup')); }, error => { cleanup(); reject(error); });
    });
    void done.then(() => { if (!state.stopping && !state.draining) { state.error = 'Capture stopped unexpectedly'; if (recording === state) lastError = state.error; } }, error => { state.error = String(error); if (recording === state && !state.abort.signal.aborted) lastError = String(error); });
    globalShortcut.register('CommandOrControl+Shift+F9', onStop);
    globalShortcut.register('CommandOrControl+Shift+M', addMarker);
    await fs.writeFile(path.join(folder, 'capture.json'), JSON.stringify({ version: 1, target: target.target, bounds: state.bounds, fps: 60, cursorEmbedded: false, startedAt: new Date().toISOString() }, null, 2));
  } catch (error) {
    if (recording) await cancelCapture();
    else { child?.kill(); log?.end(']'); try { hook?.stop(); } catch { /* not started */ } }
    throw error;
  } finally { target.bounds = originalBounds; starting = false; }
}
function detach(state: Recording) {
  for (const [name, handler] of state.handlers) state.hook.off(name, handler);
  try { state.hook.stop(); } catch (error) { state.error = String(error); }
  globalShortcut.unregister('CommandOrControl+Shift+F9');
  globalShortcut.unregister('CommandOrControl+Shift+M');
}
export function addMarker() {
  const state = recording;
  if (!state || state.stopping || state.error || !Number.isFinite(state.origin) || state.count >= 2_000_000) return;
  const dip = screen.getCursorScreenPoint(), point = process.platform === 'win32' ? screen.dipToScreenPoint(dip) : dip;
  const event: TelemetryEvent = { timeMs: performance.now() - state.origin, x: (point.x - state.bounds.x) / state.bounds.width, y: (point.y - state.bounds.y) / state.bounds.height, kind: 'marker' };
  state.log.write((state.first ? '' : ',') + JSON.stringify(event)); state.first = false; state.count++;
}
async function endStream(stream: WriteStream) {
  if (stream.closed || stream.writableFinished) return;
  await withTimeout(new Promise<void>((resolve, reject) => { stream.once('error', reject); stream.end(() => resolve()); }), 15000, 'Disk stream did not finish. Raw files are preserved.');
}
export function captureStatus() { return { active: !!recording && !recording.stopping && !recording.draining, elapsed: recording && Number.isFinite(recording.origin) ? (performance.now() - recording.origin) / 1000 : 0, error: recording?.error ?? lastError, stage: recording?.stage, progress: recording?.progress, folder: recording?.folder ?? lastFolder }; }
export function beginStop() {
  const state = recording; if (!state || state.draining) return;
  state.draining = true; state.stage = 'Finishing camera and audio chunks'; detach(state);
  if (state.process.exitCode === null && !state.process.stdin.destroyed) state.process.stdin.write('q');
}
export async function beginTrack(kind: string) {
  if (!recording || recording.stopping || recording.tracks.has(kind)) throw new Error('Capture track is not available');
  const stream = createWriteStream(path.join(recording.folder, `${kind}.webm`));
  stream.on('error', error => { if (recording) recording.error = error.message; });
  recording.tracks.set(kind, stream);
  await fs.writeFile(path.join(recording.folder, `${kind}-offset.json`), JSON.stringify({ offset: (performance.now() - recording.origin) / 1000 }));
}
export async function appendTrack(kind: string, data: ArrayBuffer) {
  const stream = recording?.tracks.get(kind);
  if (!stream || stream.writableEnded) throw new Error('Track is closed');
  await new Promise<void>((resolve, reject) => stream.write(Buffer.from(data), error => error ? reject(error) : resolve()));
}
export async function endTrack(kind: string) { const stream = recording?.tracks.get(kind); if (stream) await endStream(stream); }
export async function stopCapture(): Promise<CaptureResult> {
  const state = recording; if (!state || state.stopping) throw new Error('No active capture');
  beginStop(); state.stopping = true;
  try {
    state.log.write(']'); await endStream(state.log);
    for (const stream of state.tracks.values()) await endStream(stream);
    state.stage = 'Finalizing screen recording';
    const timer = setTimeout(() => state.process.kill(), 20000);
    try { await state.done; } finally { clearTimeout(timer); }
    if (state.error) throw new Error(state.error);
    const raw = path.join(state.folder, 'raw.mp4');
    const result = path.join(state.folder, 'recording.mp4');
    const duration = await mediaDuration(raw);
    const timeoutMs = Math.min(1800000, Math.max(120000, duration * 2000));
    const progress = [0, state.tracks.has('webcam') ? 0 : 1];
    const options = (index: number) => ({ signal: state.abort.signal, timeoutMs, onProgress: (seconds: number) => { progress[index] = Math.min(0.99, seconds / Math.max(0.001, duration)); state.progress = (progress[0] + progress[1]) / 2; } });
    state.stage = state.tracks.has('webcam') ? 'Preparing screen, audio and webcam' : 'Joining screen and audio'; state.progress = 0;
    // Audio muxing copies the screen track; run it alongside independent camera encoding.
    const screenTask = (async () => {
      if (state.tracks.has('audio')) {
        const offset = JSON.parse(await fs.readFile(path.join(state.folder, 'audio-offset.json'), 'utf8')).offset as number;
        await runFFmpeg(['-i', raw, '-itsoffset', String(offset), '-i', path.join(state.folder, 'audio.webm'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-af', 'apad', '-t', String(duration), '-movflags', '+faststart', result], options(0));
      } else await fs.copyFile(raw, result);
      progress[0] = 1;
    })();
    const cameraTask = (async () => {
      if (!state.tracks.has('webcam')) return undefined;
      const offset = JSON.parse(await fs.readFile(path.join(state.folder, 'webcam-offset.json'), 'utf8')).offset as number;
      const webcamFile = path.join(state.folder, 'webcam.mp4');
      await runFFmpeg(['-i', path.join(state.folder, 'webcam.webm'), '-vf', `tpad=start_duration=${offset}:start_mode=clone:stop_duration=${duration}:stop_mode=clone`, '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-g', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', webcamFile], options(1));
      progress[1] = 1; return registerMedia(webcamFile);
    })();
    const finalized = await Promise.allSettled([screenTask, cameraTask]);
    for (const task of finalized) if (task.status === 'rejected') throw task.reason;
    const webcam = finalized[1].status === 'fulfilled' ? finalized[1].value : undefined;
    if (state.abort.signal.aborted) throw new Error('Finalization cancelled. Raw files are preserved.');
    state.stage = 'Opening editor'; state.progress = 1;
    return { media: await registerMedia(result), telemetry: JSON.parse(await fs.readFile(path.join(state.folder, 'telemetry.json'), 'utf8')), webcam, folder: state.folder };
  } catch (error) { if (recording === state && !state.abort.signal.aborted) lastError = String(error); throw error; }
  finally { if (recording === state) recording = null; if (!recording) BrowserWindow.getAllWindows()[0]?.restore(); }
}
export async function cancelCapture() {
  const state = recording; if (!state) return;
  if (!state.draining) detach(state); state.stopping = true; state.abort.abort();
  state.process.kill(); await state.done.catch(() => {});
  if (!state.log.writableEnded) state.log.end(']');
  for (const stream of state.tracks.values()) if (!stream.writableEnded) stream.end();
  if (recording === state) recording = null;
}

const symbols: Record<string, string> = { Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`', BracketLeft: '[', Backslash: '\\', BracketRight: ']', Quote: "'", ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Backspace: '⌫', Enter: '↵', Delete: 'Del', Insert: 'Ins', PageUp: 'PgUp', PageDown: 'PgDn' };
const modifiers = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);
function keyNames(table: Record<string, number>) { const names = new Map<number, string>(); for (const [name, code] of Object.entries(table)) if (!names.has(code)) names.set(code, name); return names; }
/** "Ctrl+Shift+S" for shortcuts, a single printable character for plain typing; modifiers alone are skipped. */
function keyLabel(names: Map<number, string>, event: import('uiohook-napi').UiohookKeyboardEvent) {
  const name = names.get(event.keycode); if (!name || modifiers.has(name)) return null;
  const key = symbols[name] ?? name.replace(/^Numpad(?=\d)/, '');
  const combo = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.metaKey && 'Win'].filter(Boolean) as string[];
  if (!combo.length) return key.length === 1 && /[a-z]/i.test(key) ? event.shiftKey ? key.toUpperCase() : key.toLowerCase() : key;
  if (event.shiftKey) combo.push('Shift');
  return [...combo, key.length === 1 ? key.toUpperCase() : key].join('+');
}
