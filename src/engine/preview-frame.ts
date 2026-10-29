/** Seek completion is separate from currentTime: Chromium can expose the new time before new pixels. */
export async function seekPreviewFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Superseded seek', 'AbortError');
  if (video.readyState < 1) await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const loaded = () => finish(), failed = () => finish(new Error('Video metadata could not load')), aborted = () => finish(new DOMException('Superseded seek', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Video metadata timed out')), 10000);
    video.addEventListener('loadedmetadata', loaded); video.addEventListener('error', failed); signal.addEventListener('abort', aborted, { once: true });
  });
  if (signal.aborted) throw new DOMException('Superseded seek', 'AbortError');
  const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.001));
  if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.00001) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false, seeked = false, presented = false, callback: number | undefined, fallback: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(fallback); if (callback !== undefined) video.cancelVideoFrameCallback(callback); video.removeEventListener('seeked', done); video.removeEventListener('loadeddata', done); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const check = () => { if (seeked && presented) finish(); };
    const done = () => {
      if (video.seeking || Math.abs(video.currentTime - target) > 0.075) return;
      seeked = true; if (presented) { finish(); return; }
      // Background/occluded windows may suppress presentation callbacks. Repaint after decoder settling.
      clearTimeout(fallback); fallback = setTimeout(() => { if (video.readyState >= 2) finish(); }, 150);
    };
    const failed = () => finish(new Error('Video frame could not decode')), aborted = () => finish(new DOMException('Superseded seek', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Video frame decoding timed out')), 10000);
    video.addEventListener('seeked', done); video.addEventListener('loadeddata', done); video.addEventListener('error', failed); signal.addEventListener('abort', aborted, { once: true });
    if ('requestVideoFrameCallback' in video) callback = video.requestVideoFrameCallback((_now, metadata) => { presented = Math.abs(metadata.mediaTime - target) < 0.075; check(); });
    else presented = true;
    video.currentTime = target;
  });
}
