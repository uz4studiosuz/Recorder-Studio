import type { MediaAsset } from '../../shared/api';
import { editSettings, useEditor } from '../store/editor';
import { createCompositor, outputSize } from './compositor';
import { outputDuration, sourceAtOutput } from '../../shared/timeline';
import { prepareComposition, type FrameSource } from './composition-assets';
import { SequentialDecoder } from './decoder';

async function decoder(url: string) {
  const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto'; video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { video.src = ''; reject(new Error('Video decoder timed out')); }, 30000);
    video.onloadeddata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(new Error('Unable to decode media for export')); }; video.src = url;
  });
  await primeVideo(video);
  return video;
}
/** Chromium can report loadeddata before its initial frame is available to canvas. */
export async function primeVideo(video: HTMLVideoElement) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;
  const time = video.currentTime;
  await seekFrame(video, Math.min(video.duration / 2, time + 0.01));
  await seekFrame(video, time);
}
export async function seekFrame(video: HTMLVideoElement, time: number, presented = false) {
  const target = Math.min(time, Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.00001 && video.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Frame decoding timed out')); }, 15000);
    let seeked = false, painted = !presented || !('requestVideoFrameCallback' in video);
    const finish = () => { if (seeked && painted) { cleanup(); resolve(); } };
    const done = () => { seeked = true; if (!painted) setTimeout(() => { painted = true; finish(); }, 250); finish(); };
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); };
    // 'seeked' can fire before the new frame reaches the canvas; wait until it is presented.
    if (!painted) video.requestVideoFrameCallback(() => { painted = true; finish(); });
    video.addEventListener('seeked', done); video.currentTime = target;
  });
}
type Provider = { frameAt: (time: number) => Promise<FrameSource>; close: () => void; kind: 'webcodecs' | 'element' };
/** Prefers sequential WebCodecs decoding; falls back to seeking a (DOM-attached) video element. */
async function provider(asset: { id?: string; url: string }): Promise<Provider> {
  const api = window.recorder;
  if (api && asset.id) {
    try { const decoder = await SequentialDecoder.open(api, asset.id); return { kind: 'webcodecs', frameAt: time => decoder.frameAt(time), close: () => decoder.close() }; }
    catch (error) { console.warn('WebCodecs export unavailable, using element seeking:', error); }
  }
  const video = await decoder(asset.url);
  // Attached (but invisible) elements keep presenting frames; detached ones can be suspended by Chromium.
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(video);
  return {
    kind: 'element',
    frameAt: async time => { await seekFrame(video, time, true); return video; },
    close: () => { video.removeAttribute('src'); video.load(); video.remove(); },
  };
}
export async function exportVideo(format: 'mp4' | 'gif', resolution: number, onProgress: (progress: number, info?: string) => void, signal: AbortSignal, options?: { fps: number; crf: number; destination?: 'file' | 'clipboard'; encoder?: 'auto' | 'cpu' }) {
  const api = window.recorder; const state = useEditor.getState();
  if (!api || !state.source?.id) throw new Error('Open this video in the desktop app to export.');
  state.setPlaying(false);
  const settings = structuredClone(editSettings());
  const size = outputSize(settings.canvas.aspectRatio, resolution);
  const fps = options?.fps ?? (format === 'gif' ? 20 : 60);
  await prepareComposition(settings.canvas);
  for (const look of settings.clips ?? []) if (look.look?.canvas) await prepareComposition({ ...settings.canvas, ...look.look.canvas });
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const job = await api.startExport({ mediaId: state.source.id, format, ...size, fps, crf: options?.crf, encoder: options?.encoder, destination: options?.destination, settings, telemetry: state.telemetry });
  if (!job) return null;
  let video: Provider | undefined, webcam: Provider | undefined, pending: Promise<void> | null = null;
  try {
    video = await provider(state.source);
    if (state.webcam) webcam = await provider(state.webcam);
    const surface = document.createElement('canvas'); surface.width = size.width; surface.height = size.height;
    const context = surface.getContext('2d', { alpha: false })!;
    const draw = createCompositor(state.telemetry, settings.cursor.smoothing);
    const duration = outputDuration(settings);
    const frames = Math.ceil(duration * fps), started = performance.now();
    const label = `${video.kind === 'webcodecs' ? 'Hardware decode' : 'Compatibility decode'} · ${job.encoder.replace('h264_', '').replace('libx264', 'x264').toUpperCase()}`;
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const time = sourceAtOutput(settings, frame / fps);
      const [image, camera] = await Promise.all([video.frameAt(time), webcam?.frameAt(time)]);
      draw(surface, image, camera ?? null, time, settings);
      const pixels = context.getImageData(0, 0, size.width, size.height).data.buffer as ArrayBuffer;
      // Render the next frame while FFmpeg consumes this one.
      if (pending) await pending;
      pending = api.exportFrame(job.id, pixels);
      void pending.catch(() => {}); // A render error or cancellation still drains this in the catch block.
      const rate = (frame + 1) / Math.max(0.001, (performance.now() - started) / 1000);
      onProgress((frame + 1) / frames, `${label} · ${rate.toFixed(0)} fps`);
    }
    if (pending) await pending;
    return await api.finishExport(job.id);
  } catch (error) { if (pending) await pending.catch(() => {}); await api.cancelExport(job.id); throw error; }
  finally { video?.close(); webcam?.close(); }
}
export function nativeAsset(source: { id?: string; url: string; name: string }): MediaAsset {
  if (!source.id) throw new Error('Project files require media opened in the desktop app');
  return { id: source.id, url: source.url, name: source.name };
}
