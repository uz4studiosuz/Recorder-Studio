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
