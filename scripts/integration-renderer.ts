import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview } from '../src/components/Preview';
import { useEditor } from '../src/store/editor';
import { exportVideo, primeVideo } from '../src/engine/exporter';
import type { MediaAsset } from '../shared/api';
import { writeTrack } from '../src/engine/capture';
import { prepareComposition, createCutout } from '../src/engine/composition-assets';
import { createCompositor } from '../src/engine/compositor';
import { editSettings } from '../src/store/editor';
let stopTracks: (() => Promise<void>) | undefined;
export async function startTracks() {
  const surface = document.createElement('canvas'); surface.width = 320; surface.height = 240;
  const c = surface.getContext('2d')!;
  let t = 0;
  const interval = setInterval(() => { c.fillStyle = '#69b0a3'; c.fillRect(0, 0, 320, 240); c.fillStyle = '#111'; c.fillText(`Webcam test ${t++}`, 30, 70); }, 30);
  const webcam = surface.captureStream(30);
  const context = new AudioContext(), destination = context.createMediaStreamDestination(), oscillator = context.createOscillator();
  oscillator.connect(destination); oscillator.start(); await context.resume();
  const error = (message: string) => { throw new Error(message); };
  const writers = [await writeTrack(window.recorder!, 'audio', destination.stream, error), await writeTrack(window.recorder!, 'webcam', webcam, error)];
  stopTracks = async () => { await Promise.all(writers.map(writer => writer.stop())); clearInterval(interval); webcam.getTracks().forEach(track => track.stop()); oscillator.stop(); await context.close(); };
}
export async function finishTracks() { await stopTracks?.(); }
export async function run(media: MediaAsset, webcam?: MediaAsset, person?: MediaAsset) {
  useEditor.getState().loadCapture(media, [
    { kind: 'move', timeMs: 0, x: 0.1, y: 0.2 },
    { kind: 'mousedown', timeMs: 500, x: 0.7, y: 0.6 },
    { kind: 'move', timeMs: 650, x: 0.6, y: 0.65 },
    { kind: 'move', timeMs: 750, x: 0.5, y: 0.7 },
    { kind: 'move', timeMs: 850, x: 0.4, y: 0.8 },
    { kind: 'mouseup', timeMs: 900, x: 0.4, y: 0.8 },
  ], webcam);
  useEditor.getState().setDuration(2);
  useEditor.getState().setEdit({ trimStart: 0.25, trimEnd: 1.25, speed: 2, clickSounds: true });
  let frames = 0;
  let decoder = '';
  const mp4 = await exportVideo('mp4', 640, (_, info) => { frames++; decoder = info ?? decoder; }, new AbortController().signal);
  const gif = await exportVideo('gif', 640, () => {}, new AbortController().signal);
  const aborted = new AbortController();
  let cancelled = false;
  try { await exportVideo('mp4', 640, () => aborted.abort(), aborted.signal); }
  catch (error) { cancelled = error instanceof DOMException && error.name === 'AbortError'; }
  useEditor.getState().resetCuts();
  useEditor.getState().setEdit({ trimStart: 0, trimEnd: 2, speed: 1, clickSounds: false }); useEditor.getState().setLook({ webcamShape: 'rectangle' });
  useEditor.getState().seek(0.5); useEditor.getState().split();
  useEditor.getState().seek(1.5); useEditor.getState().split();
  useEditor.getState().selectClip(useEditor.getState().clips[1].id); useEditor.getState().deleteSelected();
  let cutFrames = 0;
  const cut = await exportVideo('mp4', 640, () => { cutFrames++; }, new AbortController().signal);
  useEditor.getState().setCanvas({ aspectRatio: '9:16', fitMode: 'follow', padding: 0 });
  const reels = await exportVideo('mp4', 640, () => {}, new AbortController().signal);
  const decode = async (asset: MediaAsset) => { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'; document.body.append(v); v.src = asset.url; await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error('Composition fixture could not load')); }); return v; };
  const video = await decode(media), cam = await decode(person ?? webcam!);
  await Promise.all([primeVideo(video), primeVideo(cam)]);
  const surface = document.createElement('canvas'); surface.width = 640; surface.height = 360;
  const draw = createCompositor([], 65), layouts: Record<string, string> = {};
  surface.getContext('2d')!.drawImage(video, 0, 0, 640, 360); layouts.raw = surface.toDataURL();
  useEditor.getState().setCanvas({ aspectRatio: '16:9', fitMode: 'fit', padding: 48, backgroundType: 'color', backgroundColor: '#314159' });
  for (const layout of ['screen', 'camera', 'split', 'overlay', 'cutout'] as const) {
    useEditor.getState().setCanvas({ layout }); const settings = editSettings(); await prepareComposition(settings.canvas);
    const geometry = draw(surface, video, cam, 0, settings); layouts[layout] = surface.toDataURL();
    if (layout === 'screen') {
      const pixel = surface.getContext('2d')!.getImageData(100, 100, 1, 1).data;
      if (pixel[0] === pixel[1] && pixel[1] === pixel[2] || !geometry) throw new Error('Initial screen frame is blank');
    }
  }
  if (new Set(Object.values(layouts)).size !== 6) throw new Error(`Composition modes did not produce distinct frames: ${Object.keys(layouts).filter((name, i, names) => names.slice(0, i).some(other => layouts[name] === layouts[other])).join(', ')}`);
  const foreground = createCutout()(cam, 0)!;
  const alpha = foreground.getContext('2d')!.getImageData(0, 0, foreground.width, foreground.height).data;
  let clear = 0, opaque = 0;
  for (let i = 3; i < alpha.length; i += 4) { if (alpha[i] < 20) clear++; if (alpha[i] > 235) opaque++; }
  if (person && (clear < alpha.length / 100 || opaque < alpha.length / 100)) throw new Error(`Person cutout mask is invalid: ${clear} transparent, ${opaque} opaque`);
  // Exercise the same cutout renderer through a real 24 FPS compressed export.
  useEditor.getState().setEdit({ trimEnd: 0.25 });
  const cutout = await exportVideo('mp4', 640, () => {}, new AbortController().signal, { fps: 24, crf: 26 });
  const clipboard = await exportVideo('mp4', 640, () => {}, new AbortController().signal, { fps: 30, crf: 22, destination: 'clipboard' });
  useEditor.getState().setEdit({ trimEnd: 0.05 });
  const ultraHD = await exportVideo('mp4', 3840, () => {}, new AbortController().signal, { fps: 24, crf: 30 });
  video.removeAttribute('src'); cam.removeAttribute('src'); video.load(); cam.load(); video.remove(); cam.remove();
  return { decoder, mp4, gif, frames, cancelled, cut, cutFrames, reels, cutout, clipboard, ultraHD, layouts, mask: { clear, opaque } };
}

export async function playbackRegression(media: MediaAsset) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  useEditor.getState().loadCapture(media, []);
  useEditor.getState().setDuration(2);
  useEditor.getState().setCanvas({ layout: 'screen', aspectRatio: '16:9', backgroundType: 'color', backgroundColor: '#314159', padding: 0 });
  const errors: string[] = [], host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); root.render(createElement(Preview, { onImport: () => {}, onError: message => errors.push(message) }));
  try {
    await wait(650);
    const surface = host.querySelector('canvas')!;
    const pixel = surface.getContext('2d')!.getImageData(300, 300, 1, 1).data;
    if (pixel[3] !== 255 || (pixel[0] === pixel[1] && pixel[1] === pixel[2]) || (pixel[0] === 49 && pixel[1] === 65 && pixel[2] === 89)) throw new Error('Preview initial screen frame is blank');
    useEditor.setState({ clips: [{ id: 'first', start: 0, end: 0.5 }, { id: 'last', start: 1.5, end: 2 }], clipsInitialized: true });
    useEditor.getState().seek(0.3); await wait(100); useEditor.getState().setPlaying(true); await wait(400);
    const crossed = useEditor.getState().currentTime;
    if (crossed < 1.55 || crossed > 1.95) throw new Error(`Cut playback jumped: ${crossed}`);
    useEditor.getState().setPlaying(false); useEditor.getState().seek(1.7); await wait(200);
    if (Math.abs(useEditor.getState().currentTime - 1.7) > 0.02) throw new Error('Paused scrub reset');
    useEditor.getState().setPlaying(true); await wait(100);
    const resumed = useEditor.getState().currentTime;
    if (resumed < 1.74 || resumed > 1.95) throw new Error(`Scrub resume jumped: ${resumed}`);
    if (errors.length) throw new Error(errors.join('; '));
    const settings = structuredClone(editSettings()), api = window.recorder!;
    const project = { version: 1 as const, media, settings, telemetry: [] };
    const one = await api.saveLibrary({ project }), two = await api.saveLibrary({ project });
    if (one.id === two.id) throw new Error('New projects reused an ID');
    await api.saveLibrary({ id: one.id, settings: { ...settings, volume: 0.3 } });
    const reopened = await api.openLibrary(one.id), independent = await api.openLibrary(two.id), list = await api.listProjects();
    if (reopened.settings.volume !== 0.3 || independent.settings.volume !== settings.volume || !list.find(p => p.id === one.id)) throw new Error('Project library update isolation failed');
    return { crossed, resumed, library: 'create/update/reopen/isolation passed' };
  } finally { useEditor.getState().setPlaying(false); root.unmount(); host.remove(); }
}


/** Checks actual pixels and decoded audio, not just the playhead store. */
export async function cutFrameRegression(media: MediaAsset, webcam: MediaAsset) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (check: () => boolean, label: string) => { const end = performance.now() + 5000; while (!check()) { if (performance.now() > end) throw new Error(label); await wait(20); } };
  useEditor.getState().loadCapture(media, [], webcam); useEditor.getState().setDuration(6);
  useEditor.getState().setCanvas({ layout: 'overlay', aspectRatio: '16:9', backgroundType: 'color', backgroundColor: '#314159', padding: 0, motionBlur: false });
  useEditor.setState({ zooms: [], webcamDodge: false, volume: 0.7 });
  const errors: string[] = [], host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); root.render(createElement(Preview, { onImport: () => {}, onError: message => errors.push(message) }));
  const audio = new AudioContext(); await audio.resume();
  const analysers = new Map<HTMLVideoElement, AnalyserNode>();
  try {
    await until(() => !!host.querySelector('canvas') && !!host.querySelector('video') && host.querySelector('video')!.readyState >= 2, 'Preview did not load'); await wait(200);
    for (const video of Array.from(host.querySelectorAll('video')).filter(v => v.src === media.url)) {
      const node = audio.createMediaElementSource(video), analyser = audio.createAnalyser(), silent = audio.createGain(); silent.gain.value = 0;
      node.connect(analyser); analyser.connect(silent); silent.connect(audio.destination); analysers.set(video, analyser);
    }
    const pixel = () => Array.from(host.querySelector('canvas')!.getContext('2d')!.getImageData(900, 400, 1, 1).data);
    const color = (channel: number) => { const p = pixel(); return p[3] === 255 && p[channel] > 100 && p[channel] > p[(channel + 1) % 3] * 2 && p[channel] > p[(channel + 2) % 3] * 2; };
    const audible = () => [...analysers].some(([v, a]) => { const samples = new Float32Array(a.fftSize); a.getFloatTimeDomainData(samples); return !v.paused && !v.muted && v.volume > 0 && Math.max(...samples.map(Math.abs)) > 0.01; });
    await until(() => color(0), 'Initial red frame missing').catch(error => { throw new Error(`${error}: ${JSON.stringify({ pixel: pixel(), errors, videos: [...host.querySelectorAll('video')].map(v => ({ time: v.currentTime, ready: v.readyState, seeking: v.seeking })) })}`); });
    const response = await fetch(media.url, {headers:{Range:'bytes=100-199'}}); if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes 100-199/${await window.recorder!.mediaSize(media.id)}` || (await response.arrayBuffer()).byteLength !== 100) throw new Error('Media range response is not seekable');
    useEditor.getState().seek(3.2);
    await until(() => color(1), 'Paused seek did not display green frame');
    const camera = [...host.querySelectorAll('video')].find(v => v.src === webcam.url)!; if (Math.abs(camera.currentTime - 3.2) > 0.075) throw new Error('Paused webcam seek did not match screen');
    if (useEditor.getState().playing) throw new Error('Paused seek started playback');
    useEditor.getState().seek(5.2); await until(() => color(2), 'Paused blue frame missing');
    for (const contiguous of [true, false]) {
      useEditor.setState({ clips: contiguous ? [{ id: 'a', start: 0, end: 1 }, { id: 'b', start: 1, end: 4 }, { id: 'c', start: 4, end: 6 }] : [{ id: 'a', start: 0, end: 1 }, { id: 'b', start: 3, end: 4 }, { id: 'c', start: 5, end: 6 }], clipsInitialized: true });
      useEditor.getState().seek(0.8); await until(() => color(0), 'Scrub back to red failed');
      useEditor.getState().setPlaying(true); await wait(450);
      await until(() => useEditor.getState().currentTime >= (contiguous ? 1.1 : 3.1), 'Playhead did not cross cut');
      await until(() => color(contiguous ? 0 : 1), `Blank frame after ${contiguous ? 'split' : 'deleted gap'}: ${pixel()}`);
      await until(audible, 'Decoded audio disappeared after cut');
      useEditor.getState().setPlaying(false); useEditor.getState().seek(5.2); await until(() => color(2), 'Post-cut paused frame did not update');
      useEditor.getState().setPlaying(true); await wait(150); await until(audible, 'Audio did not resume after paused scrub'); useEditor.getState().setPlaying(false);
    }
    for (const time of [0.2, 5.1, 0.4, 3.3, 5.2]) { useEditor.getState().seek(time); await wait(5); }
    await until(() => color(2), 'Latest rapid scrub did not win');
    if (errors.length) throw new Error(errors.join('; '));
    return { pausedPixels: 'red/green/blue match', splitPixels: 'continuous + gap passed', decodedAudio: 'PCM present after cuts and scrub', rapidScrub: 'latest target wins' };
  } finally { useEditor.getState().setPlaying(false); root.unmount(); host.remove(); await audio.close(); }
}
