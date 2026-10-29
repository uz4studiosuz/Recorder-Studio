import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Download, Monitor, Plus, X, Upload, FolderOpen, Save, Home as HomeIcon, PackageOpen, PackagePlus } from 'lucide-react';
import { useEditor, editSettings } from './store/editor';
import { Inspector } from './components/Inspector';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import type { AspectRatio } from '../shared/project';
import type { SavedProject, LibraryEntry } from '../shared/api';
import { Recorder, RecordingHUD } from './components/Recorder';
import { ExportDialog } from './components/ExportDialog';
import { nativeAsset } from './engine/exporter';
import { ProjectHome } from './components/ProjectHome';
import { Splitter } from './components/Splitter';
import { clipLaneHeight } from './components/Timeline';
import type { CSSProperties } from 'react';
import { outputDuration, outputAtSource, timelineRanges } from '../shared/timeline';
export function App() { return new URLSearchParams(window.location.search).has('hud') ? <RecordingHUD /> : <Studio />; }
function Studio() {
  const state = useEditor(), { canvas, setCanvas, source, setSource } = state;
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'home' | 'editor' | 'record'>('home'), [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'record' | 'export' | null>(null);
  const [projects, setProjects] = useState<LibraryEntry[]>([]), [loadingProjects, setLoadingProjects] = useState(true), [exportSaved, setExportSaved] = useState(false);
  const activeProject = useRef<string | undefined>(undefined), saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const onError = useCallback((message: string) => { setExportSaved(false); setNotice(message); }, []);
  useEffect(() => { void window.recorder?.listProjects().then(setProjects).catch(error => onError(String(error))).finally(() => setLoadingProjects(false)); if (!window.recorder) setLoadingProjects(false); }, []);
  const saveCurrent = async () => {
    const s = useEditor.getState(); if (!window.recorder || !s.source?.id || !s.source.duration) return;
    const project: SavedProject = { version: 1, media: nativeAsset(s.source), webcam: s.webcam ?? undefined, telemetry: s.telemetry, settings: structuredClone(editSettings(s)) };
    let thumbnail: string | undefined;
    const sourceCanvas = document.querySelector<HTMLCanvasElement>('.compositor-preview');
    if (sourceCanvas) { const thumb = document.createElement('canvas'); thumb.width = 480; thumb.height = Math.round(480 * sourceCanvas.height / sourceCanvas.width); thumb.getContext('2d')!.drawImage(sourceCanvas, 0, 0, thumb.width, thumb.height); thumbnail = thumb.toDataURL('image/jpeg', 0.75); }
    const task = saveQueue.current.catch(() => {}).then(async () => { const entry = await window.recorder!.saveLibrary(activeProject.current ? { id: activeProject.current, settings: project.settings, thumbnail } : { project, thumbnail }); activeProject.current = entry.id; setProjects(items => [entry, ...items.filter(item => item.id !== entry.id)]); });
    saveQueue.current = task; await task;
  };
  useEffect(() => { if (view !== 'editor' || !source?.duration) return; const timer = setTimeout(() => { void saveCurrent().catch(error => onError(`Auto-save failed: ${String(error)}`)); }, 1000); return () => clearTimeout(timer); }, [view, source, state.canvas, state.cursor, state.clips, state.zooms, state.speed, state.volume, state.clickSounds, state.webcamShape, state.webcamSize, state.webcamPosition, state.webcamDodge, state.webcamMirror, state.webcamBorder, state.webcamRoundness, state.webcamShadow, state.trimStart, state.trimEnd]);
  const goHome = async () => { state.setPlaying(false); try { await saveCurrent(); setView('home'); } catch (error) { onError(String(error)); } };
  const newRecording = async () => { state.setPlaying(false); try { await saveCurrent(); activeProject.current = undefined; state.setSource(null); state.selectElement(null); state.setCanvas({ layout: 'screen' }); setNotice(''); setView('record'); } catch (error) { onError(String(error)); } };
  const openLibrary = async (id: string) => { try { await saveCurrent(); const project = await window.recorder!.openLibrary(id); activeProject.current = id; useEditor.getState().loadProject(project); setNotice(''); setView('editor'); } catch (error) { onError(`Project could not open: ${String(error)}`); } };

  const importVideo = () => { void (async () => { try { await saveCurrent(); if (window.recorder) { const media = await window.recorder.openMedia(); if (media) { activeProject.current = undefined; setSource({ ...media, duration: 0 }); setView('editor'); } } else fileInput.current?.click(); } catch (error) { onError(String(error)); } })(); };
  const openProject = async () => { try { if (!window.recorder) throw new Error('Open project in the desktop app. Browser preview supports local video import.'); await saveCurrent(); const project = await window.recorder.openProject(); if (project) { activeProject.current = undefined; useEditor.getState().loadProject(project); setView('editor'); } } catch (error) { setNotice(String(error)); } };
  const currentProject = (): SavedProject | null => { const s = useEditor.getState(); return window.recorder && s.source?.id ? { version: 1, media: nativeAsset(s.source), webcam: s.webcam ?? undefined, telemetry: s.telemetry, settings: editSettings(s) } : null; };
  const exportProject = async () => {
    try { const project = currentProject(); if (!project) return; setNotice('Exporting project with its media…'); const file = await window.recorder!.exportProject(project); setNotice(file ? `Project exported: ${file}` : ''); } catch (error) { setNotice(String(error)); }
  };
  const importProject = async () => {
    try { if (!window.recorder) { fileInput.current?.click(); return; } await saveCurrent(); const project = await window.recorder.importAnyProject(); if (!project) return; activeProject.current = undefined; if ('version' in project) useEditor.getState().loadProject(project); else setSource({ ...project, duration: 0 }); setView('editor'); setNotice(''); } catch (error) { onError(String(error)); }
  };
  const saveProject = async () => {
    try { const s = useEditor.getState(); if (!window.recorder || !s.source?.id) return; if (await window.recorder.saveProject({ version: 1, media: nativeAsset(s.source), webcam: s.webcam ?? undefined, telemetry: s.telemetry, settings: editSettings(s) })) setNotice('Project saved. Keep your original recording files.'); } catch (error) { setNotice(String(error)); }
  };
  useEffect(() => {
    const command = (value: string) => {
      if (dialog || view !== 'editor') return;
      const s = useEditor.getState();
      if (value === 'zoom-in') s.zoomTimeline(1.25);
      else if (value === 'zoom-out') s.zoomTimeline(1 / 1.25);
      else if (value === 'zoom-reset') s.zoomTimeline(0);
      else if (value === 'fullscreen') window.dispatchEvent(new Event('studio:fullscreen'));
    };
    const key = (event: KeyboardEvent) => {
      if (dialog || view !== 'editor') return;
      const element = event.target as HTMLElement;
      if (element?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element?.tagName)) return;
      const s = useEditor.getState(), ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      if (ctrl && ['+', '=', '-', '_', '0'].includes(key)) { event.preventDefault(); command(['+', '='].includes(key) ? 'zoom-in' : key === '0' ? 'zoom-reset' : 'zoom-out'); }
      else if (key === 'escape') { s.selectElement(null); }
      else if (!ctrl && key === 's') { event.preventDefault(); s.toggleSnapping(); }
      else if (!ctrl && ['arrowup', 'arrowdown'].includes(key)) { event.preventDefault(); const time = outputAtSource(s, s.currentTime), points = [...new Set(timelineRanges(s).flatMap(r => [r.outputStart, r.outputEnd]))].sort((a, b) => a - b); s.setPlaying(false); s.seekOutput(key === 'arrowup' ? points.filter(t => t < time - 0.001).at(-1) ?? 0 : points.find(t => t > time + 0.001) ?? outputDuration(s)); }
      else if (ctrl && key === 'b') { event.preventDefault(); s.split(); }
      else if (ctrl && key === 'z') { event.preventDefault(); if (event.shiftKey) s.redo(); else s.undo(); }
      else if (ctrl && key === 'y') { event.preventDefault(); s.redo(); }
      else if (ctrl && key === 's') { event.preventDefault(); void saveProject(); }
      else if (key === 'delete' || key === 'backspace') { event.preventDefault(); s.deleteSelected(); }
      else if (key === 'f' && !ctrl || key === 'f11') { event.preventDefault(); command('fullscreen'); }
      else if (event.code === 'Space' && element?.tagName !== 'BUTTON') { event.preventDefault(); s.setPlaying(!s.playing); }
    };
    const unsubscribe = window.recorder?.onEditorShortcut(command);
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); unsubscribe?.(); };
  }, [dialog, view]);
  const panelStyle = { '--inspector-w': `${state.panels.inspector}px`, '--timeline-h': `${state.panels.timeline}px`, '--clip-lane-h': `${clipLaneHeight(state.panels.timeline)}px` } as CSSProperties;
  return <div className={`studio ${view === 'home' ? 'home-view' : view === 'record' ? 'record-view' : 'editor-view'}`} style={panelStyle} onPointerDownCapture={event => { if (view === 'editor' && !(event.target as HTMLElement).closest('.canvas-wrapper, .inspector, .timeline, .topbar, button, input, select, .splitter, .notice')) state.selectElement(null); }}>{view === 'home' ? <ProjectHome record={() => void newRecording()} importProject={() => void importProject()} projects={projects} loading={loadingProjects} open={id => void openLibrary(id)} /> : view === 'record' ? <Recorder close={() => setView('home')} notify={onError} onComplete={() => setView('editor')} /> : <><header className="topbar"><div className="brand"><button className="icon-button" aria-label="Back to home" title="Back to home" onClick={() => void goHome()}><HomeIcon size={18} /></button><img className="brand-logo" src="./icon.svg" alt="" width={28} height={28} draggable={false} /><span>Recorder Studio</span><span className="brand-divider" /><span className="project-title" title={source?.name}>{source?.name ?? 'Untitled project'}</span></div><div className="top-actions"><button className="icon-button" aria-label="Open project" title="Open project" onClick={() => void openProject()}><FolderOpen size={16} /></button><button className="icon-button" disabled={!source?.id} aria-label="Save project" title="Save project · Ctrl+S" onClick={() => void saveProject()}><Save size={16} /></button><span className="toolbar-separator" /><button className="icon-button" aria-label="Import project" title="Import project (.rsproject)" onClick={() => void importProject()}><PackageOpen size={16} /></button><button className="icon-button" disabled={!source?.id} aria-label="Export project" title="Export project with media (.rsproject)" onClick={() => void exportProject()}><PackagePlus size={16} /></button><label className="aspect-control"><Monitor size={14} /><span className="sr-only">Aspect ratio</span><select value={canvas.aspectRatio} onChange={event => { const aspectRatio = event.target.value as AspectRatio; state.checkpoint(); setCanvas({ aspectRatio, ...(aspectRatio === '9:16' ? { fitMode: 'follow', padding: Math.max(32, canvas.padding) } : { fitMode: 'fit' }) }); }}>{(['16:9', '9:16', '1:1', '4:3'] as const).map(ratio => <option key={ratio} value={ratio}>{ratio === '9:16' ? '9:16 · Reels' : ratio}</option>)}</select><ChevronDown size={12} /></label><button className="button subtle import-top" onClick={importVideo}><Plus size={15} />Import</button><motion.button disabled={!source?.id || !outputDuration(state)} whileTap={{ scale: 0.97 }} className="button light" onClick={() => { state.setPlaying(false); setDialog('export'); }}><Download size={14} />Export</motion.button></div></header>
  <div className="workspace"><main className="main-workspace"><div className="workspace-heading"><div><h2>Your recording. Refined.</h2><p>{canvas.aspectRatio === '9:16' ? 'Portrait framing for Reels, Shorts, and Stories.' : 'Select a clip, make a cut, shape the frame.'}</p></div></div><Preview onImport={importVideo} onError={onError} /><Splitter axis="y" /><Timeline /></main><Splitter axis="x" /><Inspector /></div><footer className="statusbar"><span><span className="status-dot" />All processing stays on your device</span><span>Free & open source<span className="footer-divider">/</span>{window.recorder ? 'Desktop studio' : 'Browser preview · native capture & export need desktop'}</span></footer></>}
{dialog === 'export' && <ExportDialog close={() => setDialog(null)} notify={onError} onSaved={path => { setNotice(`Export saved: ${path}`); setExportSaved(true); }} />}
  <input ref={fileInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/quicktime,.mov,.m4v" onChange={event => { const file = event.target.files?.[0]; if (file) { if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) { setNotice('Choose an MP4, WebM, or MOV video.'); return; } setSource({ name: file.name, url: URL.createObjectURL(file), duration: 0 }); setView('editor'); setNotice(''); } event.target.value = ''; }} />
  {notice && <div className="notice" role="status"><Upload size={18} /><p>{notice}</p>{exportSaved && <button className="button subtle" onClick={() => void window.recorder?.revealExport()}>Open Folder</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>;
}
