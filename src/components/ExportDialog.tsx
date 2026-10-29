import { useRef, useState } from 'react';
import { Download, Film, Gauge, Maximize, SlidersHorizontal, Clipboard, FileVideo, ChevronDown, X } from 'lucide-react';
import { exportVideo } from '../engine/exporter';
import { useDialog } from './useDialog';
import { useEditor } from '../store/editor';
import { outputSize } from '../engine/compositor';
import { outputDuration } from '../../shared/timeline';

const qualities = [{ name: 'Studio', crf: 18, description: 'High quality for presentations and further editing.' }, { name: 'Social Media', crf: 22, description: 'Balanced quality and size for Reels, Shorts, and uploads.' }, { name: 'Web', crf: 26, description: 'Smaller files for websites and quick sharing.' }, { name: 'Web (Low)', crf: 30, description: 'Compact files when download size matters most.' }];
export function ExportDialog({ close, notify, onSaved }: { close: () => void; notify: (message: string) => void; onSaved?: (path: string) => void }) {
  const [format, setFormat] = useState<'mp4' | 'gif'>('mp4'), [resolution, setResolution] = useState(1920), [fps, setFps] = useState(60), [crf, setCrf] = useState(18);
  const [destination, setDestination] = useState<'file' | 'clipboard'>('file'), [advanced, setAdvanced] = useState(false);
  const [renderInfo, setRenderInfo] = useState('');
  const [progress, setProgress] = useState<number | null>(null), [error, setError] = useState(''), [eta, setEta] = useState('');
  const abort = useRef<AbortController | null>(null);
  const state = useEditor(), size = outputSize(state.canvas.aspectRatio, resolution), duration = outputDuration(state);
  const busy = progress !== null, valid = format !== 'gif' || duration <= 60;
  useDialog(close, !busy);
  const quality = qualities.find(item => item.crf === crf);
  const estimatedMB = duration * size.width * size.height * fps * (0.085 * Math.pow(2, (18 - crf) / 6)) / 8 / 1e6;
  const run = async () => {
    abort.current = new AbortController(); setProgress(0); setError(''); const start = performance.now();
    try {
      const output = await exportVideo(format, resolution, (value, info) => { if (info) setRenderInfo(info); setProgress(value); if (value > 0.02) { const seconds = Math.ceil((performance.now() - start) / 1000 * (1 - value) / value); setEta(seconds >= 60 ? `About ${Math.ceil(seconds / 60)} min remaining` : `About ${seconds} sec remaining`); } }, abort.current.signal, { fps, crf, destination });
      if (output) { onSaved?.(output); if (!onSaved) notify(`${destination === 'clipboard' ? 'Video file copied to clipboard. Saved' : 'Export saved'}: ${output}`); close(); }
      else setProgress(null);
    } catch (error) { setError(error instanceof DOMException && error.name === 'AbortError' ? 'Export cancelled.' : String(error)); setProgress(null); }
  };
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Export video" className="modal export-modal"><header className="export-heading"><div><span className="eyebrow">READY TO SHARE</span><h2>Export your recording</h2></div><button className="icon-button" disabled={busy} aria-label="Close export" onClick={close}><X size={18} /></button></header>
    <fieldset disabled={busy} className="export-grid"><div><h3><Film size={18} />Format</h3><div className="segmented">{(['mp4', 'gif'] as const).map(value => <button key={value} aria-pressed={format === value} onClick={() => { setFormat(value); setFps(value === 'gif' ? 20 : 60); }}>{value.toUpperCase()}</button>)}</div></div><div><h3><Gauge size={18} />Frame rate</h3><select aria-label="Export frame rate" value={fps} onChange={e => setFps(Number(e.target.value))}>{(format === 'gif' ? [15, 20, 30] : [24, 30, 60]).map(rate => <option key={rate} value={rate}>{rate} FPS</option>)}</select></div>
    <div><h3><Maximize size={18} />Resolution</h3><div className="segmented">{[[1280, '720p'], [1920, '1080p'], [3840, '4K']].map(([edge, label]) => <button key={edge} aria-pressed={resolution === edge} onClick={() => setResolution(Number(edge))}>{label}</button>)}</div><p>{size.width} × {size.height} px · {state.canvas.aspectRatio}</p></div>
    <div><h3><SlidersHorizontal size={18} />Compression</h3><div className="segmented quality-options">{qualities.map(item => <button key={item.crf} disabled={format === 'gif'} aria-pressed={crf === item.crf} onClick={() => setCrf(item.crf)}>{item.name}</button>)}</div><p>{format === 'gif' ? 'GIF has no audio. Keep it short for a manageable file size.' : quality?.description ?? 'Custom H.264 compression.'}</p></div></fieldset>
    <button className="export-advanced" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>Advanced<ChevronDown size={17} style={{ transform: advanced ? 'rotate(180deg)' : '' }} /></button>{advanced && <div className="export-details"><label>H.264 quality · lower is sharper<input aria-label="Custom compression CRF" disabled={busy || format === 'gif'} type="number" min={14} max={35} value={crf} onChange={e => setCrf(Math.max(14, Math.min(35, Math.round(Number(e.target.value)))))} /></label><p>All kept clips, crop, composition, cursor, camera and audio are rendered. The preview safe-area guide is excluded. 4K scales your source; it does not restore missing detail.</p></div>}
    <fieldset disabled={busy} className="export-destination"><h3>Export to</h3><div className="segmented"><button aria-pressed={destination === 'file'} onClick={() => setDestination('file')}><FileVideo size={17} />File</button><button aria-pressed={destination === 'clipboard'} onClick={() => setDestination('clipboard')}><Clipboard size={17} />Clipboard</button></div><p>{destination === 'clipboard' ? 'Copies a video file for apps that accept pasted files. A copy stays in Videos / Recorder Studio / Exports.' : 'Choose the file name and folder when you export.'}</p></fieldset>
    {!valid && <p className="inline-error" role="alert">GIF supports up to 60 seconds. Shorten the timeline or choose MP4.</p>}{error && <p className="inline-error selectable" role="alert">{error}</p>}{busy && <><progress max={1} value={progress!} /><p role="status">{Math.round(progress! * 100)}% · {progress === 1 ? 'Finalizing audio and video…' : `${renderInfo} · ${eta || 'Preparing renderer…'}`}</p></>}
    <footer className="export-footer"><span>{duration.toFixed(1)} sec · {Math.ceil(duration * fps).toLocaleString()} frames{format === 'mp4' ? ` · roughly ${Math.max(0.1, estimatedMB).toFixed(1)} MB` : ''}<small>File size depends on content. Rendering runs locally.</small></span><div className="modal-actions"><button className="button subtle" onClick={() => { if (busy) abort.current?.abort(); else close(); }}>{busy ? 'Cancel export' : 'Cancel'}</button><button className="button export-primary" disabled={busy || !valid} onClick={() => void run()}>{destination === 'clipboard' ? <Clipboard size={17} /> : <Download size={17} />}Export to {destination === 'clipboard' ? 'clipboard' : 'file'}</button></div></footer>
  </section></div>;
}
