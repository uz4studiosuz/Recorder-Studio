import * as Tabs from '@radix-ui/react-tabs';
import * as Switch from '@radix-ui/react-switch';
import { Image, MousePointer2, AudioLines, RotateCcw, Check, Video, Scissors, FlipHorizontal2, Keyboard } from 'lucide-react';
import { useEditor, inspectedSettings, lookTarget } from '../store/editor';
import { cursorStyles, webcamShapes, type BackgroundId, type CursorStyle, type Layout, type WebcamPosition, type WebcamShape } from '../../shared/project';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BackgroundPicker } from './BackgroundPicker';

export const backgrounds: { id: BackgroundId; name: string; value: string }[] = [
  { id: 'sonoma', name: 'Sonoma', value: 'radial-gradient(ellipse at 15% 85%, #f8bd88 0%, transparent 55%), radial-gradient(ellipse at 90% 10%, #b1b4ec 0%, transparent 65%), linear-gradient(135deg, #9976bb, #da8f9a 55%, #675c9f)' },
  { id: 'dusk', name: 'Dusk', value: 'radial-gradient(at 20% 0%, #e9a270, transparent 65%), linear-gradient(130deg, #ad5873, #392d66)' },
  { id: 'ocean', name: 'Ocean', value: 'radial-gradient(at 0% 100%, #84ddd0, transparent 65%), linear-gradient(140deg, #82b2dc, #203a82)' },
  { id: 'peach', name: 'Peach', value: 'radial-gradient(at 90% 0%, #fff3c0, transparent 65%), linear-gradient(135deg, #f9b69e, #db7197)' },
  { id: 'forest', name: 'Forest', value: 'radial-gradient(at 0% 100%, #b6c697, transparent 70%), linear-gradient(135deg, #6baba0, #203f48)' },
  { id: 'graphite', name: 'Graphite', value: 'linear-gradient(135deg, #50525d, #202127)' },
];
const layouts: [Layout, string][] = [['screen', 'Screen'], ['overlay', 'Overlay'], ['split', 'Split'], ['cutout', 'Cutout'], ['camera', 'Camera']];
const shapeNames: Record<WebcamShape, string> = { circle: 'Circle', squircle: 'Squircle', rounded: 'Rounded', rectangle: 'Wide', portrait: 'Portrait' };
const shapeRoundness: Record<WebcamShape, number> = { circle: 100, squircle: 45, rounded: 22, rectangle: 14, portrait: 22 };
const cursorNames: Record<CursorStyle, string> = { arrow: 'Arrow', 'arrow-dark': 'Dark', pointer: 'Hand', text: 'I-beam', dot: 'Dot', ring: 'Ring', touch: 'Touch', crosshair: 'Cross' };
const positions: [WebcamPosition, string][] = [['top-left', 'Top left'], ['top-center', 'Top'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom'], ['bottom-right', 'Bottom right']];

function CursorIcon({ style }: { style: CursorStyle }) {
  const stroke = { stroke: '#111', strokeWidth: 1.4, strokeLinejoin: 'round' as const };
  return <svg viewBox="-14 -14 36 36" width="26" height="26" aria-hidden="true">{{
    arrow: <path d="M-6 -9 L-6 10 L-1 5 L3 13 L6 11.5 L2.5 4 L9 4 Z" fill="#fff" {...stroke} />,
    'arrow-dark': <path d="M-6 -9 L-6 10 L-1 5 L3 13 L6 11.5 L2.5 4 L9 4 Z" fill="#111" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />,
    pointer: <path d="M-3 12 L-6 5 Q-7 2 -4.5 2 L-2 4.5 L-2 -6 Q-2 -8.5 0.5 -8 L1 0 L5 0 Q9.5 0 9.5 4 L8 12 Z" fill="#fff" {...stroke} />,
    text: <path d="M-4 -9 H4 M0 -9 V9 M-4 9 H4" stroke="#fff" strokeWidth={2} />,
    dot: <circle r="5" fill="#fff" {...stroke} />,
    ring: <><circle r="9" fill="none" stroke="#fff" strokeWidth={2.2} /><circle r="1.8" fill="#fff" /></>,
    touch: <circle r="11" fill="#ffffff60" stroke="#fff" strokeWidth={1.5} />,
    crosshair: <path d="M-10 0 H-3 M3 0 H10 M0 -10 V-3 M0 3 V10" stroke="#fff" strokeWidth={2} />,
  }[style]}</svg>;
}
function Range({ label, value, max, min = 0, step = 1, unit = '', onChange }: { label: string; value: number; max: number; min?: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const percent = (value - min) / (max - min) * 100;
  return <label className="ap-range"><span>{label}<output>{value}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{ '--fill': `${percent}%` } as CSSProperties} onPointerDown={() => useEditor.getState().checkpoint()} onKeyDown={event => { if (event.key.startsWith('Arrow')) useEditor.getState().checkpoint(); }} onChange={event => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="ap-row"><span>{label}{hint && <small>{hint}</small>}</span><Switch.Root className="ap-switch" checked={checked} onCheckedChange={value => { useEditor.getState().checkpoint(); onChange(value); }} aria-label={label}><Switch.Thumb className="ap-switch-thumb" /></Switch.Root></label>;
}
function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="ap-group"><header><h3>{title}</h3>{aside}</header><div className="ap-card">{children}</div></section>;
}
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (value: T) => void; label: string }) {
  return <div className="ap-segmented" role="radiogroup" aria-label={label}>{options.map(([option, text]) => <button key={option} role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{text}</button>)}</div>;
}
export function Inspector({ cameraAvailable, recordingSetup = false }: { cameraAvailable?: boolean; recordingSetup?: boolean } = {}) {
  const state = useEditor();
  const look = inspectedSettings(state), { canvas, cursor } = look;
  const { setCanvas, setCursor, resetAppearance } = state;
  const selected = state.zooms.find(z => z.id === state.selectedZoom);
  const selectedClip = state.clips.find(c => c.id === state.selectedClip);
  const target = lookTarget(state), clipIndex = selectedClip ? state.clips.findIndex(c => c.id === selectedClip.id) : -1;
  const [tab, setTab] = useState('background');
  useEffect(() => { if (state.selection === 'webcam') setTab('camera'); else if (state.selection === 'video' || state.selection === 'background') setTab('background'); else if (state.selection === 'zoom') setTab('cursor'); }, [state.selection]);
  const layout = canvas.layout ?? 'overlay', hasCamera = cameraAvailable ?? !!state.webcam;
  const allowed = state.selection === 'webcam' ? ['camera'] : state.selection === 'background' ? ['background'] : state.selection === 'zoom' ? ['cursor'] : state.selection === 'video' ? ['background', 'cursor', 'audio'] : ['background', 'cursor', 'camera', 'audio'];
  const activeTab = allowed.includes(tab) ? tab : allowed[0];
  const gradientSelected = (id: BackgroundId) => canvas.background === id && (canvas.backgroundType ?? 'gradient') === 'gradient';
  return <aside className="inspector apple">
    <div className="ap-heading"><div><h2>{state.selection === 'webcam' ? selectedClip && state.clips.length > 1 ? `Camera · Clip ${clipIndex + 1}` : 'Camera' : state.selection === 'video' && selectedClip && state.clips.length > 1 ? `Clip ${clipIndex + 1}` : state.selection === 'background' ? 'Canvas' : state.selection === 'zoom' ? 'Zoom' : 'Inspector'}</h2><p>{target ? 'Changes apply to this clip only' : 'Changes apply to the whole video'}</p></div><button className="ap-icon" aria-label="Reset appearance" title="Reset appearance" onClick={resetAppearance}><RotateCcw size={14} /></button></div>
    <div className="ap-picker"><Segmented label="Element" value={(state.selection === 'webcam' ? 'webcam' : state.selection === 'background' ? 'background' : state.selection === 'video' ? 'video' : '') as 'video' | 'webcam' | 'background'} onChange={value => state.selectElement(value)} options={[['video', 'Video'], ['webcam', 'Camera'], ['background', 'Canvas']]} /></div>
    {selectedClip && state.clips.length > 1 && (state.selection === 'video' || state.selection === 'webcam') && <div className="ap-scope"><div className="ap-scope-title"><Scissors size={13} /><span>Clip {clipIndex + 1} of {state.clips.length}<small>{selectedClip.start.toFixed(2)}s – {selectedClip.end.toFixed(2)}s</small></span>{selectedClip.look && <button className="ap-link" onClick={() => state.clearClipLook(selectedClip.id)}>Reset clip</button>}</div><Segmented label="Apply changes to" value={state.lookScope} onChange={state.setLookScope} options={[['clip', 'This clip'], ['all', 'All clips']]} /></div>}
    <Tabs.Root className="inspector-panels" value={activeTab} onValueChange={setTab}><Tabs.List style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }} className="ap-tabs" aria-label="Inspector">
      {allowed.includes('background') && <Tabs.Trigger value="background"><Image size={15} />Frame</Tabs.Trigger>}{allowed.includes('cursor') && <Tabs.Trigger value="cursor"><MousePointer2 size={15} />Cursor</Tabs.Trigger>}{allowed.includes('camera') && <Tabs.Trigger value="camera"><Video size={15} />Camera</Tabs.Trigger>}{allowed.includes('audio') && <Tabs.Trigger value="audio"><AudioLines size={15} />Audio</Tabs.Trigger>}
    </Tabs.List>
      <div className="inspector-scroll ap-scroll">
        {selectedClip && activeTab === 'background' && state.selection === 'video' && <Group title="Clip timing"><div className="ap-pair"><label>In<input aria-label="Selected clip in" type="number" min={0} max={selectedClip.end - 0.05} step={0.05} value={Number(selectedClip.start.toFixed(2))} onFocus={state.checkpoint} onChange={e => state.trimClip(selectedClip.id, Number(e.target.value), selectedClip.end)} /></label><label>Out<input aria-label="Selected clip out" type="number" min={selectedClip.start + 0.05} max={state.source?.duration} step={0.05} value={Number(selectedClip.end.toFixed(2))} onFocus={state.checkpoint} onChange={e => state.trimClip(selectedClip.id, selectedClip.start, Number(e.target.value))} /></label></div><div className="ap-buttons"><button disabled={clipIndex <= 0} onClick={() => state.moveClip(selectedClip.id, clipIndex - 1)}>Move earlier</button><button disabled={clipIndex === state.clips.length - 1} onClick={() => state.moveClip(selectedClip.id, clipIndex + 1)}>Move later</button></div><button className="ap-destructive" onClick={state.deleteSelected}>Delete clip</button></Group>}
        {selected && activeTab === 'cursor' && <Group title="Selected zoom"><Range label="Scale" value={Math.round(selected.zoomScale * 100)} min={120} max={300} unit="%" onChange={scale => state.updateZoom(selected.id, { zoomScale: scale / 100 })} /><Range label="Focus X" value={Math.round(selected.targetX * 100)} max={100} unit="%" onChange={x => state.updateZoom(selected.id, { targetX: x / 100 })} /><Range label="Focus Y" value={Math.round(selected.targetY * 100)} max={100} unit="%" onChange={y => state.updateZoom(selected.id, { targetY: y / 100 })} /><p className="ap-note">Click the preview to set focus. Drag the block to move it.</p><button className="ap-destructive" onClick={() => state.deleteZoom(selected.id)}>Delete zoom</button></Group>}
        {activeTab === 'background' && <Tabs.Content value="background">
          <Group title="Layout"><div className="ap-layouts">{layouts.map(([value, label]) => <button key={value} disabled={value !== 'screen' && !hasCamera} aria-pressed={layout === value} onClick={() => { state.checkpoint(); setCanvas({ layout: value }); }}><i className={`ap-layout ap-layout-${value}`}><b /><em /></i><span>{label}</span></button>)}</div>{!hasCamera && <p className="ap-note">Record with a camera to use camera layouts.</p>}</Group>
          <Group title="Background" aside={<span className="ap-aside">{backgrounds.find(bg => bg.id === canvas.background)?.name}</span>}><div className="ap-swatches">{backgrounds.map(bg => <button key={bg.id} className={gradientSelected(bg.id) ? 'selected' : ''} aria-label={bg.name} aria-pressed={gradientSelected(bg.id)} style={{ background: bg.value }} onClick={() => { state.checkpoint(); setCanvas({ background: bg.id, backgroundType: 'gradient' }); }}>{gradientSelected(bg.id) && <Check size={14} />}</button>)}</div><BackgroundPicker /></Group>
          <Group title="Frame"><Range label="Padding" value={canvas.padding} max={120} unit=" px" onChange={padding => setCanvas({ padding })} /><Range label="Corner radius" value={canvas.radius} max={48} unit=" px" onChange={radius => setCanvas({ radius })} /><Range label="Shadow" value={canvas.shadow} max={100} unit="%" onChange={shadow => setCanvas({ shadow })} /><Toggle label="Motion blur" hint="On zoom and pan" checked={canvas.motionBlur} onChange={motionBlur => setCanvas({ motionBlur })} /></Group>
          <Group title="Framing"><Segmented label="Content mode" value={canvas.fitMode} onChange={fitMode => { state.checkpoint(); setCanvas({ fitMode }); }} options={[['fit', 'Fit'], ['fill', 'Fill'], ['follow', 'Follow']]} />{canvas.fitMode !== 'fit' && <><Range label="Horizontal focus" value={Math.round(canvas.cropX * 100)} max={100} unit="%" onChange={x => setCanvas({ cropX: x / 100 })} /><Range label="Vertical focus" value={Math.round(canvas.cropY * 100)} max={100} unit="%" onChange={y => setCanvas({ cropY: y / 100 })} /></>}<p className="ap-note">{canvas.fitMode === 'fit' ? 'Shows the complete video.' : canvas.fitMode === 'follow' ? 'Crops and follows the recorded cursor.' : 'Crops to fill the frame.'}</p>{!recordingSetup && <button className="ap-button" aria-pressed={canvas.aspectRatio === '9:16'} onClick={() => { state.checkpoint(); setCanvas({ aspectRatio: '9:16', fitMode: 'follow', padding: Math.max(32, canvas.padding) }); }}>Reels / Shorts · 9:16</button>}</Group>
        </Tabs.Content>}
        {activeTab === 'cursor' && <Tabs.Content value="cursor">
          <Group title="Style"><div className="ap-cursors">{cursorStyles.map(style => <button key={style} aria-pressed={cursor.style === style} onClick={() => { state.checkpoint(); setCursor({ style }); }}><CursorIcon style={style} /><span>{cursorNames[style]}</span></button>)}</div><p className="ap-note">Native recordings use an editable vector cursor. Imported videos keep their own.</p></Group>
          <Group title="Behavior"><Range label="Size" value={cursor.size} min={12} max={64} unit=" px" onChange={size => setCursor({ size })} /><Range label="Smoothing" value={cursor.smoothing} max={100} unit="%" onChange={smoothing => setCursor({ smoothing })} /><Toggle label="Click ripple" checked={cursor.ripple} onChange={ripple => setCursor({ ripple })} /><Toggle label="Click bounce" hint="Cursor shrinks briefly" checked={cursor.clickPulse ?? true} onChange={clickPulse => setCursor({ clickPulse })} /><Toggle label="Highlight" hint="Soft halo around cursor" checked={cursor.highlight ?? false} onChange={highlight => setCursor({ highlight })} /><Toggle label="Hide when idle" checked={cursor.hideWhenIdle} onChange={hideWhenIdle => setCursor({ hideWhenIdle })} /></Group>
          <Group title="Keystrokes" aside={<Keyboard size={13} className="ap-aside" />}><Toggle label="Show keystrokes" hint="Shortcuts appear on screen" checked={cursor.keystrokes ?? true} onChange={keystrokes => setCursor({ keystrokes })} />{(cursor.keystrokes ?? true) && <Segmented label="Keystroke mode" value={cursor.keystrokeMode ?? 'shortcuts'} onChange={keystrokeMode => { state.checkpoint(); setCursor({ keystrokeMode }); }} options={[['shortcuts', 'Shortcuts'], ['all', 'All typing']]} />}<p className="ap-note">{state.telemetry.some(e => e.kind === 'key') ? 'Recorded keys are shown at the bottom of the video.' : 'Turn on Keystrokes in New recording to capture keys.'}</p></Group>
          <Group title="Auto zoom"><button className="ap-button" disabled={!state.telemetry.length} onClick={state.regenerateZooms}>Regenerate from clicks</button></Group>
        </Tabs.Content>}
        {activeTab === 'camera' && <Tabs.Content value="camera">
          {!hasCamera && <p className="ap-note ap-empty">Enable a camera in New recording. Shape preferences set here are kept.</p>}
          {layout === 'split' && hasCamera && <Group title="Split screen"><Segmented label="Camera side" value={canvas.splitSide ?? 'right'} onChange={splitSide => { state.checkpoint(); setCanvas({ splitSide }); }} options={[['left', canvas.aspectRatio === '9:16' ? 'Top' : 'Left'], ['right', canvas.aspectRatio === '9:16' ? 'Bottom' : 'Right']]} /><Range label="Camera share" value={Math.round((canvas.splitRatio ?? (canvas.aspectRatio === '9:16' ? 0.45 : 0.28)) * 100)} min={20} max={60} unit="%" onChange={value => setCanvas({ splitRatio: value / 100 })} /><p className="ap-note">Corner radius and spacing follow Frame settings.</p></Group>}
          {layout !== 'split' && layout !== 'camera' && <Group title={layout === 'cutout' ? 'Cutout' : 'Shape'}>{layout !== 'cutout' && <div className="ap-shapes">{webcamShapes.map(shape => <button key={shape} aria-pressed={look.webcamShape === shape} onClick={() => state.setLook({ webcamShape: shape, webcamRoundness: shapeRoundness[shape] })}><i className={`ap-shape ap-shape-${shape}`} style={{ borderRadius: shape === 'circle' ? '50%' : `${shapeRoundness[shape] / 4}px` }} /><span>{shapeNames[shape]}</span></button>)}</div>}
            <Range label="Size" value={look.webcamSize} min={8} max={45} unit="%" onChange={webcamSize => state.setLook({ webcamSize })} />
            {layout === 'overlay' && look.webcamShape !== 'circle' && <Range label="Roundness" value={look.webcamRoundness ?? 30} max={100} unit="%" onChange={webcamRoundness => state.setLook({ webcamRoundness })} />}
            {layout === 'cutout' && <p className="ap-note">Background removal runs on this device. Good lighting gives cleaner edges.</p>}
          </Group>}
          {layout !== 'split' && layout !== 'camera' && <Group title="Position"><div className="ap-positions" role="radiogroup" aria-label="Camera position">{positions.map(([value, label]) => <button key={value} role="radio" aria-label={label} title={label} aria-checked={look.webcamPosition === value} onClick={() => state.setLook({ webcamPosition: value })}><i /></button>)}</div>{layout === 'overlay' && <Toggle label="Avoid cursor" hint="Moves aside when the cursor is near" checked={look.webcamDodge} onChange={webcamDodge => state.setLook({ webcamDodge })} />}</Group>}
          <Group title="Style">{layout !== 'cutout' && <Range label="Border" value={look.webcamBorder ?? 0} max={24} unit=" px" onChange={webcamBorder => state.setLook({ webcamBorder })} />}<Range label="Shadow" value={look.webcamShadow ?? 40} max={100} unit="%" onChange={webcamShadow => state.setLook({ webcamShadow })} /><label className="ap-row"><span><FlipHorizontal2 size={13} />Mirror</span><Switch.Root className="ap-switch" checked={!!look.webcamMirror} onCheckedChange={webcamMirror => state.setLook({ webcamMirror })} aria-label="Mirror camera"><Switch.Thumb className="ap-switch-thumb" /></Switch.Root></label></Group>
        </Tabs.Content>}
        {activeTab === 'audio' && <Tabs.Content value="audio">
          <Group title="Audio"><Range label={target ? 'Clip volume' : 'Volume'} value={Math.round(look.volume * 100)} max={200} unit="%" onChange={volume => state.setLook({ volume: volume / 100 })} /><Toggle label="Click sounds" hint="Clicks + chalk drag sound · preview & MP4" checked={state.clickSounds} onChange={clickSounds => state.setEdit({ clickSounds })} /></Group>
        </Tabs.Content>}
      </div></Tabs.Root><div className="ap-footer"><span className="status-dot" />Preferences saved on this device</div>
  </aside>;
}
