import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Maximize2, Minimize2, Plus, Minus, Play, Pause } from 'lucide-react';
import { useEditor, editSettings } from '../store/editor';
import { createCompositor, outputSize } from '../engine/compositor';
import { backgrounds } from './Inspector';
import { timelineRanges, outputAtSource, outputDuration, settingsAt } from '../../shared/timeline';
import { formatTime } from './Timeline';
import { prepareComposition, compositionRevision } from '../engine/composition-assets';
import { PlaybackClock } from '../engine/playback';
import { seekPreviewFrame } from '../engine/preview-frame';
import { pointerSounds } from '../engine/pointer-sounds';
export function Preview({ onImport, onError }: { onImport: () => void; onError: (message: string) => void }) {
  const state = useEditor();
  const { canvas, source, playing, currentTime, setDuration, setPlaying, telemetry, cursor, webcam, speed } = state;
  const video = useRef<HTMLVideoElement>(null), webcamVideo = useRef<HTMLVideoElement>(null), surface = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null), space = useRef<HTMLDivElement>(null), selectionBox = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false), [zoom, setZoom] = useState(1), [spaceSize, setSpaceSize] = useState({ width: 600, height: 330 });
  const sounds = useMemo(() => pointerSounds(telemetry), [telemetry]);
  useEffect(() => () => sounds.close(), [sounds]);
  const draw = useMemo(() => createCompositor(telemetry, cursor.smoothing), [telemetry, cursor.smoothing]);
  const layout = useRef<ReturnType<typeof draw>>(undefined);
  const clock = useRef(new PlaybackClock()), activeRange = useRef<string | null>(null);
  const seeking = useRef(false), seekTask = useRef<AbortController | null>(null), primed = useRef(false);
  const lastPush = useRef(0), decodeRevision = useRef(0);
  const loaded = () => { decodeRevision.current++; };
  const synchronize = useCallback((time: number) => {
    seekTask.current?.abort(); const task = new AbortController(); seekTask.current = task;
    const v = video.current, cam = webcamVideo.current; if (!v) return;
    seeking.current = true; v.pause(); cam?.pause();
    void (async () => {
      // Prime only on a new source, and let newer scrubs abort every step.
      if (!primed.current) { await Promise.all([seekPreviewFrame(v, time + 0.01, task.signal), cam ? seekPreviewFrame(cam, time + 0.01, task.signal) : Promise.resolve()]); if (task.signal.aborted) return; primed.current = true; }
      await Promise.all([seekPreviewFrame(v, time, task.signal), cam ? seekPreviewFrame(cam, time, task.signal) : Promise.resolve()]);
      if (task.signal.aborted) return;
      seeking.current = false; decodeRevision.current++;
      const s = useEditor.getState(); clock.current.reset(editSettings(s), time, performance.now());
      activeRange.current = timelineRanges(s).find(r => time >= r.start && time < r.end)?.id ?? null;
      v.playbackRate = s.speed; v.volume = Math.min(1, settingsAt(editSettings(s), time).volume); v.muted = false;
      if (s.playing) { void v.play().catch(error => { if (error?.name !== 'AbortError') { s.setPlaying(false); onError('Video playback could not start.'); } }); if (cam) { cam.playbackRate = s.speed; void cam.play().catch(() => {}); } }
    })().catch(error => { if (!task.signal.aborted) { seeking.current = false; useEditor.getState().setPlaying(false); onError(`Preview: ${String(error)}`); } });
  }, [onError]);
  useEffect(() => { primed.current = false; return () => { seekTask.current?.abort(); video.current?.pause(); webcamVideo.current?.pause(); }; }, [source?.url, webcam?.url]);
  useEffect(() => { void Promise.all([canvas, ...state.clips.filter(c => c.look?.canvas).map(c => ({ ...canvas, ...c.look!.canvas }))].map(prepareComposition)).catch(error => onError(`Composition could not load: ${String(error)}`)); }, [canvas, state.clips, onError]);
  const toggleFullscreen = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen(); else void area.current?.requestFullscreen().catch(error => onError(`Fullscreen could not open: ${String(error)}`)); }, [onError]);
  useEffect(() => { const node = space.current; const prevent = (event: WheelEvent) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); }; node?.addEventListener('wheel', prevent, { passive: false }); return () => node?.removeEventListener('wheel', prevent); }, []);
  useEffect(() => { const observer = new ResizeObserver(entries => setSpaceSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height })); if (space.current) observer.observe(space.current); const changed = () => setFullscreen(document.fullscreenElement === area.current); const toggle = () => toggleFullscreen(); document.addEventListener('fullscreenchange', changed); window.addEventListener('studio:fullscreen', toggle); return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', changed); window.removeEventListener('studio:fullscreen', toggle); }; }, [toggleFullscreen]);
  useEffect(() => { synchronize(useEditor.getState().currentTime); }, [playing, state.seekRevision, source?.url, webcam?.url, speed, state.clips, state.trimStart, state.trimEnd, synchronize]);
  useEffect(() => {
    let animation = 0, previous: unknown[] = [];
    const frame = (now: number) => {
      const v = video.current; const c = surface.current, s = useEditor.getState();
      if (v && c && v.readyState >= 2 && v.videoWidth > 0 && !v.seeking && !seeking.current) {
        if (s.playing) {
          const position = clock.current.at(editSettings(s), now);
          if (position.ended) { v.pause(); s.reportTime(position.source); s.setPlaying(false); }
          else {
            // A simple split stays on this decoder/audio element. Only removed/reordered gaps seek.
            if (activeRange.current !== position.range?.id || Math.abs(v.currentTime - position.source) > 0.25) {
              if (Math.abs(v.currentTime - position.source) > 0.08) { synchronize(position.source); animation = requestAnimationFrame(frame); return; }
              activeRange.current = position.range?.id ?? null;
            }
            v.playbackRate = s.speed;
            if (v.paused) void v.play().catch(() => {});
            if (now - lastPush.current > 30) { lastPush.current = now; s.reportTime(position.source); }
          }
          const nextVolume = Math.min(1, settingsAt(editSettings(s), position.source).volume);
          if (Math.abs(v.volume - nextVolume) > 0.001) v.volume = nextVolume;
        }
        sounds.update(v.currentTime, s.playing && s.clickSounds);
        const cam = webcamVideo.current;
        if (cam && cam.readyState >= 1) { if (Math.abs(cam.currentTime - v.currentTime) > 0.15) cam.currentTime = Math.min(v.currentTime, Math.max(0, cam.duration - 0.001)); cam.playbackRate = s.speed; if (s.playing && cam.paused) void cam.play().catch(() => {}); }
        // Clip looks live in s.clips, so it is part of the signature: edits show while paused.
        const signature = [v.currentTime, s.canvas, s.cursor, s.zooms, s.clips, s.webcamShape, s.webcamSize, s.webcamPosition, s.webcamDodge, s.webcamRoundness, s.webcamBorder, s.webcamShadow, s.webcamMirror, cam?.currentTime, s.selection, s.selectedZoom, compositionRevision(), decodeRevision.current];
        if (signature.some((value, index) => value !== previous[index])) {
          layout.current = draw(c, v, cam, v.currentTime, editSettings(s)); previous = signature;
          const rect = s.selection === 'webcam' ? layout.current?.webcam : s.selection === 'video' || s.selection === 'zoom' ? layout.current?.frame : undefined;
          const box = selectionBox.current;
          if (box) { box.style.display = rect ? 'block' : 'none'; if (rect) { box.style.left = `${rect.x / c.width * 100}%`; box.style.top = `${rect.y / c.height * 100}%`; box.style.width = `${rect.width / c.width * 100}%`; box.style.height = `${rect.height / c.height * 100}%`; } }
        }
      }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame); return () => cancelAnimationFrame(animation);
  }, [draw, source?.url, webcam?.url, sounds, synchronize]);
  const dimensions = outputSize(canvas.aspectRatio), fit = Math.min(Math.max(1, spaceSize.width - 12) / dimensions.width, Math.max(1, spaceSize.height - 12) / dimensions.height);
  return <div className={`preview-area ${fullscreen ? 'is-fullscreen' : ''}`} ref={area}><div className="preview-meta"><span>{state.selection ? `SELECTED / ${state.selection.toUpperCase()}` : 'PREVIEW'}</span><div className="preview-tools"><span>{canvas.aspectRatio} · {dimensions.width} × {dimensions.height}</span><button className="icon-button" aria-label="Zoom preview out" onClick={() => setZoom(value => Math.max(0.5, value / 1.25))}><Minus size={13} /></button><button className="preview-fit" onClick={() => setZoom(1)} title="Fit preview">{zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}</button><button className="icon-button" aria-label="Zoom preview in" onClick={() => setZoom(value => Math.min(4, value * 1.25))}><Plus size={13} /></button><button className="icon-button" aria-label={fullscreen ? 'Exit fullscreen preview' : 'Fullscreen preview'} title="Fullscreen preview · F" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></div><div ref={space} className={`canvas-space ${zoom > 1 ? 'zoomed' : ''}`} onPointerDown={event => { if (event.target === event.currentTarget) state.selectElement(null); }} onWheel={event => { if (event.ctrlKey || event.metaKey) setZoom(value => Math.max(0.5, Math.min(4, value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))); }}>
  {source ? <><div className={`canvas-wrapper ${state.selection === 'background' ? 'background-selected' : ''}`} style={{ width: dimensions.width * fit * zoom, height: dimensions.height * fit * zoom }}><canvas ref={surface} width={dimensions.width} height={dimensions.height} className="compositor-preview" aria-label="Composited video preview" onDoubleClick={toggleFullscreen} onClick={event => {
    const g = layout.current; if (!g) return;
    const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * dimensions.width, y = (event.clientY - rect.top) / rect.height * dimensions.height;
    const inside = (r: { x: number; y: number; width: number; height: number }) => x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
    if (g.webcam && inside(g.webcam)) { state.selectElement('webcam'); return; }
    if (!inside(g.frame)) { state.selectElement('background'); return; }
    if (state.selectedZoom) {
      const tx = g.frame.x + g.frame.width / 2 - g.camera.x * g.frame.width * g.camera.scale, ty = g.frame.y + g.frame.height / 2 - g.camera.y * g.frame.height * g.camera.scale;
      state.checkpoint(); state.updateZoom(state.selectedZoom, { targetX: g.crop.x + (x - tx) / (g.frame.width * g.camera.scale) * g.crop.width, targetY: g.crop.y + (y - ty) / (g.frame.height * g.camera.scale) * g.crop.height });
    } else state.selectElement('video');
  }} /><div ref={selectionBox} className="selection-overlay"><span>{state.selection === 'webcam' ? 'Webcam' : state.selection === 'zoom' ? 'Zoom focus' : 'Video'}</span><i /><i /><i /><i /></div>{canvas.aspectRatio === '9:16' && <div className="reels-guide" aria-hidden="true"><span>Reels safe area</span></div>}</div>
  <video crossOrigin="anonymous" className="decoder" ref={video} src={source.url} playsInline preload="auto" onSeeked={loaded} onLoadedData={loaded} onLoadedMetadata={event => { const duration = event.currentTarget.duration; if (!Number.isFinite(duration) || duration <= 0) { onError('This video has no usable duration.'); return; } setDuration(duration); }} onError={() => { setPlaying(false); onError('Unable to decode this video. Try an H.264 MP4 or WebM file.'); }} />{webcam && <video crossOrigin="anonymous" ref={webcamVideo} className="decoder" src={webcam.url} muted playsInline preload="auto" onSeeked={loaded} onLoadedData={loaded} />}</> :
  <div className={`preview-canvas ${canvas.aspectRatio === '9:16' ? 'portrait' : ''}`} style={{ aspectRatio: canvas.aspectRatio.replace(':', '/'), background: backgrounds.find(bg => bg.id === canvas.background)?.value }}><div className="video-frame"><div className="empty-preview"><h1>Your next recording.</h1><p>Choose a video to start editing.</p><button className="button light" onClick={onImport}><Upload size={14} />Import video</button></div></div></div>}
  </div><div className="preview-caption"><span>{source?.name ?? 'No media loaded'}</span><span>{state.selectedZoom ? 'Click the video to set zoom focus' : 'Click the video or webcam to select'}</span></div>{fullscreen && <div className="fullscreen-transport"><button className="button light" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Play'}</button><span>{formatTime(outputAtSource(state, currentTime), true)} / {formatTime(outputDuration(state), true)}</span><button className="button subtle" onClick={toggleFullscreen}>Exit fullscreen · Esc</button></div>}</div>;
}
