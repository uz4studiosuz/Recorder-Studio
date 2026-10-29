import type { RecorderAPI } from '../../shared/api';
import { withTimeout } from '../../shared/async';
type TrackKind = 'audio' | 'webcam';
interface TrackWriter { recorder: MediaRecorder; stop: () => Promise<void>; abort: () => void }
export interface CaptureSession { stop: () => Promise<void>; dispose: () => Promise<void> }
export interface CaptureDevices { microphone: boolean; systemAudio: boolean; webcam: boolean; microphoneId?: string; webcamId?: string }
export function deviceError(feature: string, error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return `${feature}: device not found. Connect a device, choose another input, or continue without it.`;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return `${feature}: access denied. Enable desktop-app access in Windows Settings → Privacy & security.`;
  if (name === 'NotReadableError' || name === 'TrackStartError') return `${feature}: the device is busy or unavailable. Close other apps using it or choose another device.`;
  if (name === 'OverconstrainedError') return `${feature}: selected device or capture settings are unavailable. Refresh the device list.`;
  return `${feature}: ${error instanceof Error ? error.message : String(error)}`;
}
export async function prepareCapture(options: CaptureDevices, onError: (message: string) => void, preview?: { webcam?: MediaStream | null; microphone?: MediaStream | null }): Promise<{ start: () => Promise<CaptureSession>; dispose: () => void; warnings: string[]; active: string[] }> {
  const api = window.recorder!;
  const streams: MediaStream[] = []; const writers: TrackWriter[] = [];
  let context: AudioContext | null = null;
  let disposed = false;
  const warnings: string[] = [], active: string[] = [];
  const cameraClone = options.webcam && preview?.webcam?.getVideoTracks().some(track => track.readyState === 'live') ? preview.webcam.clone() : undefined;
  const micClone = options.microphone && preview?.microphone?.getAudioTracks().some(track => track.readyState === 'live') ? preview.microphone.clone() : undefined;
  if (cameraClone) streams.push(cameraClone); if (micClone) streams.push(micClone);
  const dispose = () => { if (disposed) return; disposed = true; streams.forEach(stream => stream.getTracks().forEach(track => track.stop())); if (context && context.state !== 'closed') void context.close().catch(() => {}); };
  try {
    await api.armLoopback();
    let webcam: MediaStream | undefined;
    if (options.webcam) {
      try {
        webcam = cameraClone ?? await navigator.mediaDevices.getUserMedia({ video: { ...(options.webcamId ? { deviceId: { exact: options.webcamId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
        streams.push(webcam); active.push('Webcam');
      } catch (error) { warnings.push(deviceError('Webcam', error)); }
    }
    const audioSources: MediaStream[] = [];
    if (options.microphone) {
      try {
        const mic = micClone ?? await navigator.mediaDevices.getUserMedia({ audio: { ...(options.microphoneId ? { deviceId: { exact: options.microphoneId } } : {}), echoCancellation: true }, video: false });
        streams.push(mic); audioSources.push(mic); active.push('Microphone');
      } catch (error) { warnings.push(deviceError('Microphone', error)); }
    }
    if (options.systemAudio) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); streams.push(screen);
        if (!screen.getAudioTracks().length) throw new Error('No loopback audio track. Check your output device or continue without system audio.');
        audioSources.push(new MediaStream(screen.getAudioTracks())); active.push('System audio');
        // Keep the associated display track alive until stop: some backends end loopback when its video is stopped.
      } catch (error) { warnings.push(deviceError('System audio', error)); }
    }
    let audio: MediaStream | undefined;
    if (audioSources.length) {
      context = new AudioContext({ sampleRate: 48000 }); await context.resume();
      const destination = context.createMediaStreamDestination();
      for (const source of audioSources) context.createMediaStreamSource(source).connect(destination);
      audio = destination.stream; streams.push(audio);
    }
    return { dispose, warnings, active, start: async () => {
      try {
        if (audio) writers.push(await writeTrack(api, 'audio', audio, onError));
        if (webcam) writers.push(await writeTrack(api, 'webcam', webcam, onError));
      } catch (error) { await Promise.allSettled(writers.map(writer => writer.stop())); dispose(); throw error; }
      return { stop: async () => { try { await Promise.all(writers.map(writer => writer.stop())); } finally { dispose(); } }, dispose: async () => { writers.forEach(writer => writer.abort()); dispose(); } };
    } };
  } catch (error) { dispose(); throw error; }
}
export async function writeTrack(api: RecorderAPI, kind: TrackKind, stream: MediaStream, onError: (message: string) => void): Promise<TrackWriter> {
  const candidates = kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const preferred = candidates.find(codec => MediaRecorder.isTypeSupported(codec));
  if (!preferred) throw new Error(`No supported ${kind} recording codec is available`);
  const recorder = new MediaRecorder(stream, { mimeType: preferred, videoBitsPerSecond: 6_000_000 });
  await api.beginTrack(kind);
  let pending = Promise.resolve(); let failure: unknown; let queued = 0; let stopped: Promise<void> | undefined; let aborted = false;
  recorder.ondataavailable = event => {
    if (!event.data.size || failure || aborted) return;
    queued += event.data.size;
    if (queued > 64 * 1024 * 1024) { failure = new Error('Recording disk writer is too slow'); onError(String(failure)); return; }
    pending = pending.then(async () => { if (failure || aborted) return; await api.appendTrack(kind, await event.data.arrayBuffer()); queued -= event.data.size; }).catch(error => { failure = error; if (!aborted) onError(String(error)); });
  };
  recorder.onerror = () => { failure = new Error(`${kind} recording failed`); onError(String(failure)); };
  recorder.start(500);
  return { recorder, abort: () => { aborted = true; failure = new Error('Track cancelled'); if (recorder.state !== 'inactive') recorder.stop(); }, stop: () => {
    if (stopped) return stopped;
    stopped = (async () => {
      if (recorder.state !== 'inactive') await withTimeout(new Promise<void>(resolve => { recorder.addEventListener('stop', () => resolve(), { once: true }); recorder.stop(); }), 15000, `${kind}: encoder did not finish. Raw files are preserved.`);
      await withTimeout(pending, 30000, `${kind}: disk writes did not finish. Raw files are preserved.`);
      await withTimeout(api.endTrack(kind), 10000, `${kind}: track could not close.`); if (failure) throw failure;
    })();
    return stopped;
  } };
}
