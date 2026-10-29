import { useEffect, useRef, useState } from 'react';
import type { CaptureTarget, EditSettings } from '../../shared/api';
import type { CanvasSettings } from '../../shared/project';
import type { Region } from '../engine/region';
import { createCompositor, outputSize } from '../engine/compositor';
import { prepareComposition } from '../engine/composition-assets';


export function CapturePreview({ target, stream, mode, region, layout, settings: chosen }: { target?: CaptureTarget; stream: MediaStream | null; mode: string; region: Region; layout: CanvasSettings['layout']; settings: EditSettings }) {
  const camera = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const video = camera.current; if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(error => setError(String(error)));
    return () => { video.pause(); video.srcObject = null; };
  }, [stream]);
  useEffect(() => {
    let cancelled = false, frame = 0;
    const source = document.createElement('canvas'); source.width = target?.width ?? 1920; source.height = target?.height ?? 1080;
    source.getContext('2d')!.fillRect(0, 0, source.width, source.height);
    const image = new Image(); let painted = false; image.src = target?.thumbnail ?? '';
    const draw = createCompositor([], 0), settings = structuredClone(chosen); settings.clips = [];
    settings.canvas = { ...settings.canvas, layout: stream ? layout : 'screen', aspectRatio: mode === 'landscape' ? '16:9' : '9:16', fitMode: chosen.canvas.fitMode === 'follow' ? 'fill' : chosen.canvas.fitMode };
    settings.zooms = [];
    setError('');
    void prepareComposition(settings.canvas).catch(error => { if (!cancelled) setError(`Preview: ${String(error)}`); });
    const render = () => {
      if (cancelled) return;
      if (!painted && image.complete && image.naturalWidth) {
        const crop = mode === 'crop' ? region : { x: 0, y: 0, width: 1, height: 1 };
        const width = Math.max(1, Math.round((target?.width ?? 1920) * crop.width)), height = Math.max(1, Math.round((target?.height ?? 1080) * crop.height));
        if (source.width !== width || source.height !== height) { source.width = width; source.height = height; }
        source.getContext('2d')!.drawImage(image, crop.x * image.naturalWidth, crop.y * image.naturalHeight, crop.width * image.naturalWidth, crop.height * image.naturalHeight, 0, 0, width, height);
        painted = true;
      }
      try { if (canvas.current) draw(canvas.current, source, camera.current, performance.now() / 1000, settings); }
      catch (error) { setError(`Preview: ${String(error)}`); return; }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [target?.id, target?.thumbnail, stream, mode, region, layout, chosen.canvas, chosen.webcamSize, chosen.webcamShape, chosen.webcamPosition, chosen.webcamMirror, chosen.webcamRoundness, chosen.webcamShadow, chosen.webcamBorder]);
  const size = outputSize(chosen.canvas.aspectRatio, 1280);
  return <section className="capture-composition"><div className="capture-preview-label"><strong>Composition preview</strong><span>{stream ? 'Camera LIVE' : 'Camera off'}</span></div><div className="capture-composition-surface"><canvas ref={canvas} width={size.width} height={size.height} aria-label="Recording composition preview" /><video ref={camera} muted playsInline className="decoder" /></div><p>Camera is live. Screen uses the selected source snapshot. Your chosen layout is applied in the editor.</p>{error && <p className="inline-error" role="alert">{error}</p>}</section>;
}
