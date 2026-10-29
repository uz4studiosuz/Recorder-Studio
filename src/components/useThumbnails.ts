import { useEffect, useState } from 'react';
import { seekFrame } from '../engine/exporter';
import { SequentialDecoder } from '../engine/decoder';
export interface Thumbnail { time: number; url: string }
/** Coarse-to-fine sample order, so an evenly spread strip appears early and gets denser. */
function sampleOrder(count: number) {
  const order: number[] = [], seen = new Set<number>();
  for (let step = Math.max(1, Math.floor(count / 12)); step >= 1; step = Math.floor(step / 2)) {
    for (let index = 0; index < count; index += step) if (!seen.has(index)) { seen.add(index); order.push(index); }
    if (step === 1) break;
  }
  return order;
}
export function useThumbnails(url: string | undefined, duration: number, mediaId?: string) {
  const [frames, setFrames] = useState<Thumbnail[]>([]);
  useEffect(() => {
    setFrames([]); if (!url || !duration) return;
    let cancelled = false; const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true;
    // A detached element can hand the canvas the same stale frame after every seek; keep it attached and invisible.
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    const canvas = document.createElement('canvas');
    let timer: ReturnType<typeof setTimeout>, decoder: SequentialDecoder | undefined;
    const loaded = new Promise<void>((resolve, reject) => { timer = setTimeout(() => reject(new Error('Thumbnail timeout')), 15000); video.onloadeddata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(new Error('Thumbnail decode failed')); }; video.src = url; });
    void loaded.catch(() => {});
    void (async () => {
      try {
        if (window.recorder && mediaId) decoder = await SequentialDecoder.open(window.recorder, mediaId).catch(() => undefined);
        if (!decoder) { document.body.append(video); await loaded; }
        const first = decoder ? await decoder.frameAt(0) : null;
        const width = first?.displayWidth ?? video.videoWidth, height = first?.displayHeight ?? video.videoHeight;
        canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * (height || 9) / (width || 16)));
        const count = Math.max(12, Math.min(160, Math.ceil(duration / 0.5))), result: Thumbnail[] = [];
        let flushed = 0;
        for (const index of sampleOrder(count)) {
          if (cancelled) return;
          const time = Math.min(duration - 0.001, duration * (index + 0.5) / count);
          const image = decoder ? await decoder.frameAt(time) : (await seekFrame(video, time, true), video); if (cancelled) return;
          canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
          result.push({ time, url: canvas.toDataURL('image/jpeg', 0.6) });
          if (result.length - flushed >= (flushed < 12 ? 12 : 16)) { flushed = result.length; setFrames([...result].sort((a, b) => a.time - b.time)); }
        }
        if (!cancelled) setFrames(result.sort((a, b) => a.time - b.time));
      } catch { /* The main decoder reports media errors; thumbnails are optional. */ }
      finally { decoder?.close(); video.removeAttribute('src'); video.load(); video.remove(); }
    })();
    return () => { cancelled = true; clearTimeout(timer); video.removeAttribute('src'); video.load(); video.remove(); };
  }, [url, duration, mediaId]);
  return frames;
}
/** The thumbnail nearest to a source time; frames are sorted by time. */
export function nearestThumbnail(frames: Thumbnail[], time: number) {
  if (!frames.length) return undefined;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (frames[mid].time < time) lo = mid + 1; else hi = mid; }
  return lo > 0 && Math.abs(frames[lo - 1].time - time) < Math.abs(frames[lo].time - time) ? frames[lo - 1] : frames[lo];
}
