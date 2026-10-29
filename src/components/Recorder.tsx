import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Monitor, AppWindow, RefreshCw, Mic, Camera, AudioLines, LoaderCircle, FolderOpen, Keyboard } from 'lucide-react';
import type { CaptureTarget } from '../../shared/api';
import { prepareCapture, type CaptureSession } from '../engine/capture';
import { portraitRegion, moveRegion, type Region } from '../engine/region';
import { useEditor, editSettings } from '../store/editor';
import { Inspector } from './Inspector';
import { MicrophoneTest } from './MicrophoneTest';
import { CapturePreview } from './CapturePreview';
import { useLiveInput, useAudioMeter } from './useLiveInputs';
import { withTimeout } from '../../shared/async';
export function RecordingHUD() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = setInterval(() => { void window.recorder?.captureStatus().then(s => setElapsed(s.elapsed)); }, 500); return () => clearInterval(timer); }, []);
  return <div className="recording-hud"><span className="record-dot" /><strong>Recording</strong><span>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}</span><button className="button subtle" title="Add zoom marker · Ctrl+Shift+M" onClick={() => void window.recorder?.addRecordingMarker()}>Marker</button><button className="button light" title="Stop & edit · Ctrl+Shift+F9" onClick={() => void window.recorder?.requestStop()}>Stop</button></div>;
}
type Prepared = Awaited<ReturnType<typeof prepareCapture>>;
export function Recorder({ close, notify, onComplete }: { close: () => void; notify: (message: string) => void; onComplete?: () => void }) {
  const [targets, setTargets] = useState<CaptureTarget[]>([]), [target, setTarget] = useState('');
  const [microphone, setMicrophone] = useState(false), [systemAudio, setSystemAudio] = useState(false), [webcam, setWebcam] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [microphoneId, setMicId] = useState(''), [webcamId, setCamId] = useState('');
  const editorSettings = useEditor();
  const composition = editorSettings.canvas.layout ?? 'screen';
  const setComposition = (layout: typeof composition) => editorSettings.setCanvas({ layout });
  const [mode, setMode] = useState<'landscape' | 'crop' | 'follow'>('landscape');
  const [keystrokes, setKeystrokes] = useState(() => { try { return localStorage.getItem('recorder-studio-keystrokes') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('recorder-studio-keystrokes', keystrokes ? '1' : '0'); } catch { /* preference only */ } }, [keystrokes]);
  const [region, setRegion] = useState<Region>(portraitRegion(1920, 1080)), [cropScale, setCropScale] = useState(1);
  const [status, setStatus] = useState('loading'), [elapsed, setElapsed] = useState(0), [error, setError] = useState('');
  const [retryPreview, setRetryPreview] = useState(0), [saveStage, setSaveStage] = useState(''), [saveProgress, setSaveProgress] = useState<number | undefined>(), [waitSeconds, setWaitSeconds] = useState(0);
  const operation = useRef(0), savingPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (['saving', 'cancelling'].includes(status)) { const modal = savingPanel.current?.closest('.modal'); if (modal) modal.scrollTop = 0; savingPanel.current?.focus(); } }, [status]);
  const [warnings, setWarnings] = useState<string[]>([]), [activeInputs, setActiveInputs] = useState<string[]>([]);
  const session = useRef<CaptureSession | null>(null), prepared = useRef<Prepared | null>(null), stopping = useRef(false), requestedStop = useRef(false);
  const drag = useRef<{ x: number; y: number; region: Region; width: number; height: number } | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const selected = targets.find(item => item.id === target);
  const busy = ['starting', 'recording', 'saving', 'cancelling'].includes(status);
  const previewEnabled = !['recording', 'saving', 'cancelling'].includes(status);
  const cameraPreview = useLiveInput('video', webcam && previewEnabled, webcamId, retryPreview);
  const microphonePreview = useLiveInput('audio', microphone && previewEnabled, microphoneId, retryPreview);
  const micLevel = useAudioMeter(microphonePreview.stream);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [busy, close]);
  useEffect(() => { editorSettings.setCanvas({ aspectRatio: mode === 'landscape' ? '16:9' : '9:16', fitMode: mode === 'follow' ? 'follow' : 'fit' }); }, [mode]);
  const refreshDevices = useCallback(async () => {
    try { await window.recorder?.armLoopback(); const list = await navigator.mediaDevices.enumerateDevices(); setDevices(list); } catch (error) { setError(`Unable to list devices: ${String(error)}`); }
  }, []);
  const refreshSources = useCallback(async () => {
    if (!window.recorder) { setStatus('unavailable'); return; }
    try { const items = await window.recorder.targets(); setTargets(items); setTarget(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? ''); setStatus('ready'); }
    catch (error) { setError(String(error)); setStatus('unavailable'); }
  }, []);
  useEffect(() => {
    void refreshSources();
    void window.recorder?.armLoopback().then(refreshDevices);
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    const unsubscribe = window.recorder?.onStopRequest(() => { if (!session.current) requestedStop.current = true; else void stopRef.current(); });
    return () => { unsubscribe?.(); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices); prepared.current?.dispose(); };
  }, [refreshDevices, refreshSources]);
  useEffect(() => { setRegion(portraitRegion(selected?.width ?? 1920, selected?.height ?? 1080, cropScale)); }, [selected?.width, selected?.height, cropScale]);
  const cancelSaving = async () => {
    operation.current++; setStatus('cancelling');
    prepared.current?.dispose(); void session.current?.dispose();
    try { await withTimeout(window.recorder!.cancelCapture(), 20000, 'Cancel timed out. Your raw files remain on disk.'); }
    catch (error) { notify(String(error)); }
    finally { session.current = null; prepared.current = null; stopping.current = false; setError('Finalization cancelled. Raw screen, camera, and audio files are preserved. Open recording folder to recover them.'); setStatus('error'); }
  };
  stopRef.current = async () => {
    if (stopping.current || !session.current) return;
    const request = ++operation.current;
    stopping.current = true; setStatus('saving'); setWaitSeconds(0); setSaveStage('Finishing camera and audio chunks'); setSaveProgress(undefined);
    try {
      await withTimeout(window.recorder!.prepareStop(), 10000, 'Could not stop screen capture.');
      await withTimeout(session.current.stop(), 60000, 'Camera/audio finalization timed out. Raw files are preserved.');
      if (request !== operation.current) return;
      setSaveStage('Finalizing screen recording');
      const result = await window.recorder!.stopCapture();
      if (request !== operation.current) return;
      const editor = useEditor.getState(); editor.loadCapture(result.media, result.telemetry, result.webcam);
      editor.setCanvas({ layout: result.webcam ? composition : 'screen', aspectRatio: mode === 'landscape' ? '16:9' : '9:16', fitMode: useEditor.getState().canvas.fitMode });
      notify(`Recording saved: ${result.folder}`); if (onComplete) onComplete(); else close();
    } catch (error) {
      if (request !== operation.current) return;
      setError(`Recording could not finish: ${String(error)}. Raw files remain in Videos/Recorder Studio.`); setStatus('error');
      void session.current?.dispose();
      try { await withTimeout(window.recorder!.cancelCapture(), 20000, 'Cleanup timed out'); } catch { /* recovery folder remains available */ }
    } finally { if (request === operation.current) { session.current = null; prepared.current = null; stopping.current = false; } }
  };
  useEffect(() => {
    if (!['recording', 'saving'].includes(status)) return;
    let cancelled = false;
    const started = performance.now();
    const timer = setInterval(() => {
      if (status === 'saving') setWaitSeconds(Math.floor((performance.now() - started) / 1000));
      void window.recorder!.captureStatus().then(result => {
        if (cancelled) return;
        if (status === 'recording') { setElapsed(result.elapsed); if (result.error) { setError(result.error); void stopRef.current(); } }
        else { if (result.stage) setSaveStage(result.stage); setSaveProgress(result.progress); }
      }).catch(error => { if (!cancelled) setError(`Capture status: ${String(error)}`); });
    }, 400);
    return () => { cancelled = true; clearInterval(timer); };
  }, [status]);
  const startNative = async () => {
    if (!prepared.current) return; setStatus('starting'); setError(''); requestedStop.current = false; operation.current++;
    try {
      await window.recorder!.startCapture(target, { ...(mode === 'crop' ? { region } : {}), keystrokes });
      session.current = await prepared.current.start(); setStatus('recording');
      if (requestedStop.current) void stopRef.current();
    } catch (error) { prepared.current?.dispose(); prepared.current = null; await window.recorder!.cancelCapture(); setError(String(error)); setStatus('ready'); }
  };
  const audioDevices = devices.filter(device => device.kind === 'audioinput'), cameras = devices.filter(device => device.kind === 'videoinput');
  return <div className="recording-page"><section aria-label="Recording studio" className="recorder-modal"><div className="recorder-title"><button className="button subtle" disabled={busy} onClick={close}>← Projects</button><div><h2>{status === 'saving' || status === 'cancelling' ? 'Preparing your recording' : status === 'recording' ? 'Recording your screen' : 'New recording'}</h2><p>Select a source, check the framing, then choose your inputs.</p></div><button className="icon-button" aria-label="Refresh sources and devices" disabled={busy || status === 'review'} onClick={() => { void refreshSources(); void refreshDevices(); setRetryPreview(value => value + 1); }}><RefreshCw size={17} /></button></div>
    <div className="recorder-columns"><div className="source-column"><div className="format-options" aria-label="Recording format">{([['landscape', 'Landscape', '16:9'], ['crop', 'Reels region', '9:16'], ['follow', 'Reels follow', '9:16']] as const).map(([value, name, ratio]) => <button key={value} disabled={busy || status === 'review'} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{name}<small>{ratio}</small></button>)}</div>
    <div className="source-preview" style={{ aspectRatio: `${selected?.width ?? 16}/${selected?.height ?? 9}`, '--source-ratio': (selected?.width ?? 16) / (selected?.height ?? 9) } as CSSProperties}>{selected?.thumbnail ? <img src={selected.thumbnail} alt={`Preview of ${selected.name}`} draggable={false} /> : <div className="source-placeholder"><Monitor size={28} /><span>{status === 'loading' ? 'Loading source previews…' : 'Choose a source below'}</span></div>}
      {mode === 'crop' && selected && <div role="group" aria-label="Selected Reels capture region" className="capture-region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} onPointerDown={event => { if (busy || status === 'review') return; event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, region, width: rect.width, height: rect.height }; }} onPointerMove={event => { if (drag.current) setRegion(moveRegion(drag.current.region, drag.current.region.x + (event.clientX - drag.current.x) / drag.current.width, drag.current.region.y + (event.clientY - drag.current.y) / drag.current.height)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><span>9:16</span></div>}
    </div>{mode === 'crop' && <div className="crop-controls"><label>Region size<input type="range" aria-label="Reels region size" min={0.3} max={1} step={0.01} value={cropScale} disabled={busy || status === 'review'} onChange={e => setCropScale(Number(e.target.value))} /></label><label>Left<input aria-label="Capture region horizontal position" type="range" min={0} max={Math.max(0, 1 - region.width)} step={0.001} value={region.x} disabled={busy || status === 'review'} onChange={e => setRegion(moveRegion(region, Number(e.target.value), region.y))} /></label></div>}
    <p className="capture-explanation">{mode === 'crop' ? 'Drag the outlined region to the content you want. Only this portrait area is saved.' : mode === 'follow' ? 'Record the full source. The 9:16 editor follows your cursor so text stays large instead of shrinking the entire desktop.' : 'The complete source is recorded, with an editable cursor.'}</p>
    <CapturePreview target={selected} stream={cameraPreview.stream} mode={mode} region={region} layout={composition} settings={editSettings()} /><div className="source-list" aria-label="Capture sources">{targets.map(item => <button key={item.id} disabled={busy || status === 'review'} className={`source-card ${target === item.id ? 'selected' : ''}`} aria-pressed={target === item.id} onClick={() => setTarget(item.id)}>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Monitor size={24} />}<span>{item.kind === 'screen' ? <Monitor size={12} /> : <AppWindow size={12} />}<span>{item.name}</span></span>{target === item.id && <Check className="source-check" size={17} />}</button>)}</div>
    </div><div className="device-column"><h3>Capture inputs</h3><label className="field-label">Composition<select aria-label="Recording composition" value={composition} disabled={busy || status === 'review'} onChange={e => { const value = e.target.value as typeof composition; setComposition(value); if (value !== 'screen') setWebcam(true); }}><option value="screen">Screen only</option><option value="camera">Full screen camera</option><option value="split">Split screen</option><option value="overlay">Camera overlay</option><option value="cutout">Camera cutout</option></select></label><p className="device-help">Camera layouts keep separate screen and webcam tracks so you can change the composition after recording.</p><label className="device-toggle"><Mic size={17} /><span>Microphone<small>{audioDevices.length ? `${audioDevices.length} input(s) available` : 'No microphone detected'}</small></span><input type="checkbox" disabled={busy || status === 'review' || (!audioDevices.length && !microphone)} checked={microphone} onChange={e => setMicrophone(e.target.checked)} /></label>{microphone && <select aria-label="Microphone device" value={microphoneId} disabled={busy || status === 'review'} onChange={e => setMicId(e.target.value)}><option value="">System default</option>{audioDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select>}
    <label className="device-toggle"><Keyboard size={17} /><span>Keystrokes<small>Show shortcuts &amp; typing on screen</small></span><input type="checkbox" disabled={busy || status === 'review'} checked={keystrokes} onChange={e => setKeystrokes(e.target.checked)} /></label>
    <label className="device-toggle"><AudioLines size={17} /><span>System audio<small>Windows output / loopback</small></span><input type="checkbox" disabled={busy || status === 'review'} checked={systemAudio} onChange={e => setSystemAudio(e.target.checked)} /></label>
    <label className="device-toggle"><Camera size={17} /><span>Webcam<small>{cameras.length ? `${cameras.length} camera(s) available` : 'No camera detected'}</small></span><input type="checkbox" disabled={busy || status === 'review' || (!cameras.length && !webcam)} checked={webcam} onChange={e => { setWebcam(e.target.checked); if (e.target.checked && composition === 'screen') setComposition('overlay'); }} /></label>{webcam && <select aria-label="Webcam device" disabled={busy || status === 'review'} value={webcamId} onChange={e => setCamId(e.target.value)}><option value="">System default</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select>}
    {microphone && <div className="microphone-meter"><span>Microphone level {microphonePreview.loading ? '· opening…' : ''}</span><meter aria-label="Microphone input level" min={0} max={1} value={micLevel} /><small>Speak to check the input</small></div>}{microphone && <MicrophoneTest busy={busy} stream={microphonePreview.stream} />}{cameraPreview.loading && <p className="device-help" role="status">Opening live camera…</p>}{cameraPreview.error && <p className="inline-error" role="alert">{cameraPreview.error}</p>}{microphonePreview.error && <p className="inline-error" role="alert">{microphonePreview.error}</p>}<p className="device-help">Optional inputs are checked before recording. An unavailable device will not silently cancel your screen recording.</p>{(!audioDevices.length || !cameras.length) && <p className="device-help">Missing an input? Connect the device, then check Windows Settings → Privacy & security → Camera / Microphone → desktop app access. Use Refresh to check again.</p>}<p className="shortcut-help">Stop: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F9</kbd><br />Zoom marker: <kbd>Ctrl+Shift+M</kbd><br />Show / hide bar: <kbd>Ctrl+Shift+H</kbd></p>
    {warnings.length > 0 && <div className="device-warnings" role="alert">{warnings.map(message => <p key={message}>{message}</p>)}{status === 'review' && <p>Available: screen{activeInputs.length ? `, ${activeInputs.join(', ')}` : ' only'}. Continue or go back to change devices.</p>}</div>}
    </div><fieldset className="record-appearance" disabled={busy || status === 'review'}><Inspector recordingSetup cameraAvailable={webcam} /></fieldset></div>
    {error && <p className="inline-error" role="alert">{error}</p>}{status === 'unavailable' && !error && <p className="inline-error">Recording requires the desktop app. Run npm run dev or open the Windows build.</p>}
    {['saving', 'cancelling'].includes(status) && <div ref={savingPanel} tabIndex={-1} className="saving-overlay" role="status" aria-live="polite"><LoaderCircle className="spin" size={34} /><h3>{status === 'cancelling' ? 'Keeping raw files…' : 'Saving your recording'}</h3><p>{saveStage}</p>{saveProgress !== undefined ? <progress max={1} value={saveProgress} /> : <progress />}<span>{waitSeconds}s elapsed{saveProgress !== undefined ? ` · ${Math.round(saveProgress * 100)}% of this step` : ''}</span><p>Your screen capture is stopped. Camera and audio are being prepared for editing.</p><div><button className="button subtle" onClick={() => void window.recorder?.revealRecording()}><FolderOpen size={14} />Open recording folder</button><button className="button subtle" disabled={status === 'cancelling'} onClick={() => void cancelSaving()}>Keep raw files & stop processing</button></div></div>}
    {status === 'error' && <button className="button subtle" onClick={() => void window.recorder?.revealRecording()}><FolderOpen size={14} />Open recording folder</button>}
    <div className="recorder-footer"><span role="status">{status === 'saving' ? 'Saving video, audio, and telemetry…' : status === 'starting' ? 'Checking inputs and starting capture…' : status === 'recording' ? `${Math.floor(elapsed)} seconds recorded` : 'Saved locally in Videos / Recorder Studio'}</span><div className="modal-actions"><button className="button subtle" disabled={busy} onClick={() => { prepared.current?.dispose(); prepared.current = null; if (status === 'review') { setStatus('ready'); setWarnings([]); } else close(); }}>{status === 'review' ? 'Change devices' : 'Cancel'}</button>{['saving', 'cancelling'].includes(status) ? <button className="button light" disabled><LoaderCircle size={14} className="spin" />{status === 'cancelling' ? 'Cancelling…' : 'Saving…'}</button> : status === 'recording' ? <button className="button light" onClick={() => void stopRef.current()}>Stop & edit</button> : <button className="button light" disabled={!['ready', 'review', 'error'].includes(status) || !target || cameraPreview.loading || microphonePreview.loading} onClick={async () => {
      if (status === 'review') { await startNative(); return; }
      setStatus('starting'); setError(''); setWarnings([]);
      try {
        prepared.current = await prepareCapture({ microphone, systemAudio, webcam, microphoneId, webcamId }, message => { setError(message); void stopRef.current(); }, { webcam: cameraPreview.stream, microphone: microphonePreview.stream });
        setWarnings(prepared.current.warnings); setActiveInputs(prepared.current.active);
        if (prepared.current.warnings.length) setStatus('review'); else await startNative();
      } catch (error) { prepared.current?.dispose(); prepared.current = null; setError(String(error)); setStatus('ready'); }
    }}><span className="record-dot" />{status === 'review' ? 'Continue with available inputs' : 'Start recording'}</button>}</div></div>
  </section></div>;
}
