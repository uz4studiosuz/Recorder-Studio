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
/** Bits per pixel per frame for a CRF-like quality value; screen text needs more than camera footage. */
export function exportBitrate(width: number, height: number, fps: number, crf = 18) {
  const bitsPerPixel = 0.12 * 2 ** ((18 - crf) / 6);
  return Math.round(Math.min(160e6, Math.max(2e6, width * height * fps * bitsPerPixel)));
}
/**
 * Finds a hardware-preferred WebCodecs H.264 configuration. Encoding the canvas directly on the GPU avoids
 * a synchronous getImageData readback and an 8–33 MB IPC copy per frame, which dominated export time.
 */
export async function h264Config(width: number, height: number, fps: number, crf?: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  // High profile; level 5.2 covers 4K60, 4.2 covers 1080p60 for encoders that reject higher levels.
  const codecs = width * height > 1920 * 1088 ? ['avc1.640034', 'avc1.640033', 'avc1.4D0034'] : ['avc1.64002A', 'avc1.640034', 'avc1.4D002A', 'avc1.42002A'];
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = { codec, width, height, framerate: fps, bitrate: exportBitrate(width, height, fps, crf), bitrateMode: 'variable', latencyMode: 'quality', hardwareAcceleration, avc: { format: 'annexb' } };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch { /* try the next configuration */ }
    }
  }
  return null;
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
  // GPU WebCodecs encoding for MP4 unless the user explicitly chose CPU; GIF needs raw frames for palette generation.
  const webcodecs = format === 'mp4' && options?.encoder !== 'cpu' && !!api.exportChunk ? await h264Config(size.width, size.height, fps, options?.crf) : null;
  const job = await api.startExport({ mediaId: state.source.id, format, ...size, fps, crf: options?.crf, encoder: options?.encoder, video: webcodecs ? 'h264' : 'raw', destination: options?.destination, settings, telemetry: state.telemetry });
  if (!job) return null;
  let video: Provider | undefined, webcam: Provider | undefined, pending: Promise<void> | null = null;
  let encoder: VideoEncoder | undefined, encoderError: unknown;
  try {
    video = await provider(state.source);
    if (state.webcam) webcam = await provider(state.webcam);
    const surface = document.createElement('canvas'); surface.width = size.width; surface.height = size.height;
    const context = surface.getContext('2d', { alpha: false, willReadFrequently: !webcodecs })!;
    if (webcodecs) {
      // Encoded chunks are small; chain their writes so main receives them strictly in order.
      encoder = new VideoEncoder({
        output: chunk => {
          const data = new ArrayBuffer(chunk.byteLength); chunk.copyTo(data);
          const previous = pending ?? Promise.resolve();
          pending = previous.then(() => api.exportChunk(job.id, data));
          void pending.catch(error => { encoderError ??= error; });
        },
        error: error => { encoderError ??= error; },
      });
      encoder.configure(webcodecs);
    }
    const draw = createCompositor(state.telemetry, settings.cursor.smoothing);
    const duration = outputDuration(settings);
    const frames = Math.ceil(duration * fps), started = performance.now();
    const label = `${video.kind === 'webcodecs' ? 'Hardware decode' : 'Compatibility decode'} · ${job.encoder === 'webcodecs' ? `GPU encode${webcodecs?.hardwareAcceleration === 'prefer-hardware' ? '' : ' (auto)'}` : job.encoder.replace('h264_', '').replace('libx264', 'x264').toUpperCase()}`;
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const time = sourceAtOutput(settings, frame / fps);
      const [image, camera] = await Promise.all([video.frameAt(time), webcam?.frameAt(time)]);
      draw(surface, image, camera ?? null, time, settings);
      if (encoder) {
        if (encoderError) throw encoderError;
        const frameImage = new VideoFrame(surface, { timestamp: Math.round(frame * 1e6 / fps), duration: Math.round(1e6 / fps) });
        try { encoder.encode(frameImage, { keyFrame: frame % (fps * 2) === 0 }); } finally { frameImage.close(); }
        // Bound GPU memory: keep a few frames in flight while the next one renders.
        while (encoder.encodeQueueSize > 3 && !encoderError) await new Promise(resolve => encoder!.addEventListener('dequeue', resolve, { once: true }));
      } else {
        const pixels = context.getImageData(0, 0, size.width, size.height).data.buffer as ArrayBuffer;
        // Render the next frame while FFmpeg consumes this one.
        if (pending) await pending;
        pending = api.exportFrame(job.id, pixels);
        void pending.catch(() => {}); // A render error or cancellation still drains this in the catch block.
      }
      const rate = (frame + 1) / Math.max(0.001, (performance.now() - started) / 1000);
      onProgress((frame + 1) / frames, `${label} · ${rate.toFixed(0)} fps`);
    }
    if (encoder) { await encoder.flush(); if (encoderError) throw encoderError; }
    if (pending) await pending;
    if (encoderError) throw encoderError;
    return await api.finishExport(job.id);
  } catch (error) { if (pending) await pending.catch(() => {}); await api.cancelExport(job.id); throw error; }
  finally { if (encoder && encoder.state !== 'closed') encoder.close(); video?.close(); webcam?.close(); }
}
export function nativeAsset(source: { id?: string; url: string; name: string }): MediaAsset {
  if (!source.id) throw new Error('Project files require media opened in the desktop app');
  return { id: source.id, url: source.url, name: source.name };
}
