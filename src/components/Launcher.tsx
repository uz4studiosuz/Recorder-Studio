import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, AudioLines, Camera, CameraOff, Check, ChevronDown, ChevronUp, Keyboard, LoaderCircle, Maximize2, Mic, MicOff, Minus, Monitor, RefreshCw, Smartphone, Timer, X } from 'lucide-react';
import type { CaptureTarget, StudioHandoff } from '../../shared/api';
import { prepareCapture, type CaptureSession } from '../engine/capture';
import { withTimeout } from '../../shared/async';
import { useAudioMeter, useLiveInput } from './useLiveInputs';
import { MicrophoneTest } from './MicrophoneTest';

type Layout = StudioHandoff['layout'];
type Status = 'loading' | 'ready' | 'review' | 'countdown' | 'starting' | 'recording' | 'saving' | 'error' | 'unavailable';
type Prepared = Awaited<ReturnType<typeof prepareCapture>>;
const cameraLayouts: Array<[Exclude<Layout, 'screen'>, string]> = [['overlay', 'Overlay'], ['split', 'Split'], ['camera', 'Full camera'], ['cutout', 'Cutout']];
const countdowns = [0, 3, 5] as const;
const BAR_HEIGHT = 104, PANEL_HEIGHT = 440;

function usePreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const stored = localStorage.getItem(`recorder-launcher-${key}`); return stored === null ? initial : JSON.parse(stored) as T; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(`recorder-launcher-${key}`, JSON.stringify(value)); } catch { /* preference only */ } }, [key, value]);
  return [value, setValue] as const;
}

function CameraPreview({ stream, mirror }: { stream: MediaStream | null; mirror: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (video.current) video.current.srcObject = stream; }, [stream]);
  return <video ref={video} className={`launcher-camera-video ${mirror ? 'mirrored' : ''}`} autoPlay muted playsInline />;
}

/**
 * Compact floating launch bar shown at startup. It records with the same capture pipeline as the
 * full recording page, then hands the finished recording to the studio window for editing.
 */
export function Launcher() {
  const [targets, setTargets] = useState<CaptureTarget[]>([]);
  const [target, setTarget] = usePreference<string>('target', '');
  const [microphone, setMicrophone] = usePreference<boolean>('microphone', false);
  const [microphoneId, setMicrophoneId] = usePreference<string>('microphone-id', '');
  const [systemAudio, setSystemAudio] = usePreference<boolean>('system-audio', false);
  const [webcam, setWebcam] = usePreference<boolean>('webcam', false);
  const [webcamId, setWebcamId] = usePreference<string>('webcam-id', '');
  const [cameraLayout, setCameraLayout] = usePreference<Exclude<Layout, 'screen'>>('camera-layout', 'overlay');
  const [reels, setReels] = usePreference<boolean>('reels', false);
  const [keystrokes, setKeystrokes] = usePreference<boolean>('keystrokes', false);
  const [countdown, setCountdown] = usePreference<number>('countdown', 3);
  const [panel, setPanel] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState(''), [stage, setStage] = useState(''), [progress, setProgress] = useState<number | undefined>();
  const session = useRef<CaptureSession | null>(null), prepared = useRef<Prepared | null>(null), stopping = useRef(false), requestedStop = useRef(false);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const busy = ['countdown', 'starting', 'recording', 'saving'].includes(status);
  const layout: Layout = webcam ? cameraLayout : 'screen';
  // Live previews stay open until recording; prepareCapture clones them so devices open only once.
  const previewEnabled = !['recording', 'saving'].includes(status);
  const cameraPreview = useLiveInput('video', webcam && previewEnabled, webcamId, retry);
  const microphonePreview = useLiveInput('audio', microphone && previewEnabled, microphoneId, retry);
  const micLevel = useAudioMeter(microphonePreview.stream);

  useEffect(() => { document.documentElement.classList.add('launcher-mode'); return () => document.documentElement.classList.remove('launcher-mode'); }, []);
  // Size the window to the bar's real content (it changes with the camera layout select and DPI),
  // so controls are never clipped; the setup panel needs a minimum width for its two columns.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current; if (!element) return;
    const apply = () => {
      // Natural width = every control (not the flexible spacer) + gaps + bar padding + shell padding.
      const style = getComputedStyle(element), children = Array.from(element.children) as HTMLElement[];
      const content = children.filter(child => !child.classList.contains('launcher-spacer')).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
      const gaps = (parseFloat(style.columnGap) || 0) * Math.max(0, children.length - 1);
      const width = Math.ceil(content + gaps + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2 + 16 + 24), open = panel && !busy;
      void window.recorder?.resizeLauncher(Math.min(1600, Math.max(open ? 900 : 480, width)), open ? PANEL_HEIGHT : BAR_HEIGHT);
    };
    apply();
    const observer = new ResizeObserver(apply); observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [panel, busy, webcam, status]);
  const refreshDevices = useCallback(async () => {
    try { await window.recorder?.armLoopback(); setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* device list is optional */ }
  }, []);
  const refreshSources = useCallback(async () => {
    if (!window.recorder) { setStatus('unavailable'); setMessage('Run the desktop app to record.'); return; }
    try {
      const items = await window.recorder.targets(); setTargets(items);
      setTarget(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? '');
      setStatus(current => ['loading', 'error', 'unavailable'].includes(current) ? 'ready' : current); setMessage('');
    } catch (error) { setStatus('error'); setMessage(String(error)); }
  }, [setTarget]);
  useEffect(() => {
    void refreshSources(); void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    const unsubscribe = window.recorder?.onStopRequest(() => { if (!session.current) requestedStop.current = true; else void stopRef.current(); });
    return () => { unsubscribe?.(); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices); prepared.current?.dispose(); };
  }, [refreshSources, refreshDevices]);
  // Keep source thumbnails fresh while the setup panel is open so the screen preview stays current.
  useEffect(() => {
    if (!panel || busy) return;
    let running = false;
    const timer = setInterval(() => { if (running) return; running = true; void refreshSources().finally(() => { running = false; }); }, 2000);
    return () => clearInterval(timer);
  }, [panel, busy, refreshSources]);
  // Device labels are only available after a permitted preview opens.
  useEffect(() => { if (cameraPreview.stream || microphonePreview.stream) void refreshDevices(); }, [cameraPreview.stream, microphonePreview.stream, refreshDevices]);
  useEffect(() => {
    if (!['recording', 'saving'].includes(status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void window.recorder!.captureStatus().then(result => {
        if (cancelled) return;
        if (status === 'recording' && result.error) { setMessage(result.error); void stopRef.current(); }
        if (status === 'saving') { if (result.stage) setStage(result.stage); setProgress(result.progress); }
      }).catch(() => {});
    }, 400);
    return () => { cancelled = true; clearInterval(timer); };
  }, [status]);

  stopRef.current = async () => {
    if (stopping.current || !session.current) return;
    stopping.current = true; setStatus('saving'); setStage('Finishing camera and audio'); setProgress(undefined);
    try {
      await withTimeout(window.recorder!.prepareStop(), 10000, 'Could not stop screen capture.');
      await withTimeout(session.current.stop(), 60000, 'Camera/audio finalization timed out. Raw files are preserved.');
      setStage('Finalizing screen recording');
      const result = await window.recorder!.stopCapture();
      setStatus('ready'); setMessage('');
      await window.recorder!.openStudio({ ...result, layout: result.webcam ? layout : 'screen', aspectRatio: reels ? '9:16' : '16:9', fitMode: reels ? 'follow' : 'fit' });
    } catch (error) {
      setStatus('error'); setMessage(`Recording could not finish: ${String(error).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, '')} Raw files remain in Videos/Recorder Studio.`);
      void session.current?.dispose();
      try { await withTimeout(window.recorder!.cancelCapture(), 20000, 'Cleanup timed out'); } catch { /* recovery folder remains */ }
    } finally { session.current = null; prepared.current = null; stopping.current = false; }
  };
  const startNative = async () => {
    if (!prepared.current) return;
    setPanel(false); setMessage(''); requestedStop.current = false;
    try {
      if (countdown > 0) { setStatus('countdown'); await window.recorder!.countdown(countdown); }
      setStatus('starting');
      await window.recorder!.startCapture(target, { keystrokes });
      session.current = await prepared.current.start(); setStatus('recording');
      if (requestedStop.current) void stopRef.current();
    } catch (error) { prepared.current?.dispose(); prepared.current = null; await window.recorder!.cancelCapture(); setStatus('ready'); setMessage(String(error)); }
  };
  const record = async () => {
    if (status === 'review') { await startNative(); return; }
    setStatus('starting'); setMessage('');
    try {
      prepared.current = await prepareCapture({ microphone, systemAudio, webcam, microphoneId, webcamId }, error => { setMessage(error); void stopRef.current(); }, { webcam: cameraPreview.stream, microphone: microphonePreview.stream });
      if (prepared.current.warnings.length) { setMessage(prepared.current.warnings.join(' ')); setStatus('review'); }
      else await startNative();
    } catch (error) { prepared.current?.dispose(); prepared.current = null; setStatus('ready'); setMessage(String(error)); }
  };
  const selected = targets.find(item => item.id === target);
  const microphones = devices.filter(device => device.kind === 'audioinput'), cameras = devices.filter(device => device.kind === 'videoinput');
  const toggle = (active: boolean, label: string, on: ReactNode, off: ReactNode, change: () => void, extra?: ReactNode) =>
    <button className={`launcher-toggle ${active ? 'active' : ''}`} aria-pressed={active} title={label} aria-label={label} disabled={busy} onClick={change}>{active ? on : off}{extra}</button>;

  return <div className="launcher-shell">
    {panel && !busy && <section className="launcher-panel" aria-label="Recording setup">
      <div className="launcher-panel-screen">
        <div className="launcher-panel-heading"><strong>Screen</strong><button className="launcher-icon small" title="Refresh sources" aria-label="Refresh sources" onClick={() => { void refreshSources(); setRetry(value => value + 1); }}><RefreshCw size={13} /></button></div>
        <div className="launcher-screen-preview">{selected?.thumbnail ? <img src={selected.thumbnail} alt={`Preview of ${selected.name}`} draggable={false} /> : <Monitor size={30} />}{reels && <span className="launcher-reels-guide" title="Reels: the editor follows your cursor in 9:16" />}</div>
        <div className="launcher-source-grid">{targets.map(item => <button key={item.id} className={target === item.id ? 'selected' : ''} aria-pressed={target === item.id} title={item.name} onClick={() => setTarget(item.id)}>
          {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} /> : <Monitor size={18} />}
          <span>{item.kind === 'screen' ? <Monitor size={10} /> : <AppWindow size={10} />}{item.name}</span>{target === item.id && <Check size={13} className="launcher-source-check" />}
        </button>)}</div>
      </div>
      <div className="launcher-panel-devices">
        <div className="launcher-device">
          <div className="launcher-panel-heading"><strong>Camera</strong><button className={`launcher-chip ${webcam ? 'active' : ''}`} onClick={() => setWebcam(!webcam)}>{webcam ? 'On' : 'Off'}</button></div>
          <div className="launcher-camera">{webcam ? cameraPreview.stream ? <CameraPreview stream={cameraPreview.stream} mirror /> : <span>{cameraPreview.loading ? 'Opening camera…' : cameraPreview.error || 'No camera'}</span> : <span><CameraOff size={20} /> Camera off</span>}</div>
          {webcam && <div className="launcher-device-row">
            <select aria-label="Camera device" value={webcamId} onChange={event => setWebcamId(event.target.value)}><option value="">Default camera</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select>
            <select aria-label="Camera layout" value={cameraLayout} onChange={event => setCameraLayout(event.target.value as Exclude<Layout, 'screen'>)}>{cameraLayouts.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
          </div>}
        </div>
        <div className="launcher-device">
          <div className="launcher-panel-heading"><strong>Microphone</strong><button className={`launcher-chip ${microphone ? 'active' : ''}`} onClick={() => setMicrophone(!microphone)}>{microphone ? 'On' : 'Off'}</button></div>
          {microphone ? <>
            <select aria-label="Microphone device" value={microphoneId} onChange={event => setMicrophoneId(event.target.value)}><option value="">Default microphone</option>{microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select>
            <div className="launcher-meter" aria-label="Microphone level"><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></div>
            <small className="launcher-hint">{microphonePreview.error || (microphonePreview.loading ? 'Opening microphone…' : 'Speak to check the level, or record a 5-second test.')}</small>
            <MicrophoneTest stream={microphonePreview.stream} busy={busy} />
          </> : <small className="launcher-hint">Turn the microphone on to check its level.</small>}
        </div>
      </div>
    </section>}
    <div ref={bar} className="launcher-bar" role="toolbar" aria-label="Recorder Studio launcher">
      <div className="launcher-grip" title="Drag to move"><img src="./icon.svg" width={22} height={22} alt="" draggable={false} /></div>
      <button className="launcher-source" disabled={busy} title="Choose screen or window" onClick={() => setPanel(!panel)}>
        {selected?.thumbnail ? <img src={selected.thumbnail} alt="" draggable={false} /> : selected?.kind === 'window' ? <AppWindow size={15} /> : <Monitor size={15} />}
        <span>{selected?.name ?? (status === 'loading' ? 'Loading sources…' : 'Choose a source')}</span>
        {panel ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      <span className="launcher-divider" />
      <div className="launcher-format" role="group" aria-label="Recording format">
        <button className={!reels ? 'active' : ''} aria-pressed={!reels} disabled={busy} onClick={() => setReels(false)} title="Landscape 16:9"><Monitor size={14} />16:9</button>
        <button className={reels ? 'active' : ''} aria-pressed={reels} disabled={busy} onClick={() => setReels(true)} title="Reels 9:16 — the editor follows your cursor"><Smartphone size={14} />Reels</button>
      </div>
      <span className="launcher-divider" />
      {toggle(microphone, microphone ? 'Microphone on' : 'Microphone off', <Mic size={16} />, <MicOff size={16} />, () => { setMicrophone(!microphone); if (!microphone) setPanel(true); }, microphone && <span className="launcher-mini-meter" style={{ transform: `scaleX(${Math.max(0.05, micLevel)})` }} />)}
      {toggle(systemAudio, systemAudio ? 'System audio on' : 'System audio off', <AudioLines size={16} />, <AudioLines size={16} />, () => setSystemAudio(!systemAudio))}
      {toggle(webcam, webcam ? 'Camera on' : 'Camera off', <Camera size={16} />, <CameraOff size={16} />, () => { setWebcam(!webcam); if (!webcam) setPanel(true); })}
      {webcam && <label className="launcher-layout"><span className="sr-only">Camera layout</span><select value={cameraLayout} disabled={busy} onChange={event => setCameraLayout(event.target.value as Exclude<Layout, 'screen'>)}>{cameraLayouts.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
      {toggle(keystrokes, keystrokes ? 'Show keystrokes on' : 'Show keystrokes off', <Keyboard size={16} />, <Keyboard size={16} />, () => setKeystrokes(!keystrokes))}
      <button className={`launcher-toggle launcher-countdown ${countdown ? 'active' : ''}`} disabled={busy} title={countdown ? `Countdown: ${countdown}s` : 'Countdown off'} aria-label="Countdown" onClick={() => setCountdown(countdowns[(countdowns.indexOf(countdown as typeof countdowns[number]) + 1) % countdowns.length])}><Timer size={16} />{countdown > 0 && <small>{countdown}</small>}</button>
      <span className="launcher-spacer" />
      {status === 'saving'
        ? <span className="launcher-saving" role="status" title={stage}><LoaderCircle size={15} className="spin" />{stage}{progress !== undefined ? ` · ${Math.round(progress * 100)}%` : '…'}</span>
        : <button className="launcher-record" disabled={!target || !['ready', 'review', 'error'].includes(status) || cameraPreview.loading || microphonePreview.loading} onClick={() => void record()} title="Start recording · stop with Ctrl+Shift+F9">
          {['starting', 'countdown'].includes(status) ? <LoaderCircle size={15} className="spin" /> : <span className="record-dot" />}{status === 'review' ? 'Continue' : status === 'countdown' ? 'Get ready' : status === 'recording' ? 'Recording' : 'Record'}
        </button>}
      <span className="launcher-divider" />
      <button className="launcher-icon" title="Open full studio" aria-label="Open full studio" disabled={busy} onClick={() => void window.recorder?.openStudio()}><Maximize2 size={15} /></button>
      <button className="launcher-icon" title="Minimize" aria-label="Minimize" onClick={() => void window.recorder?.minimizeLauncher()}><Minus size={15} /></button>
      <button className="launcher-icon" title="Close" aria-label="Close" disabled={busy} onClick={() => window.close()}><X size={15} /></button>
    </div>
    {message && <p className="launcher-message" role="alert" title={message}>{message}</p>}
  </div>;
}
