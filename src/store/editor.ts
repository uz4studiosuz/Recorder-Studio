import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CanvasSettings, CursorSettings, ZoomSegment, TelemetryEvent, VideoClip, ClipLook } from '../../shared/project';
import type { EditSettings, MediaAsset, SavedProject } from '../../shared/api';
import { autoZoom } from '../engine/motion';
import { outputDuration, sourceAtOutput, timelineRanges, applyLook } from '../../shared/timeline';

export interface MediaSource { id?: string; name: string; url: string; duration: number }
interface EditorState {
  canvas: CanvasSettings; cursor: CursorSettings; source: MediaSource | null;
  zooms: ZoomSegment[]; currentTime: number; playing: boolean; telemetry: TelemetryEvent[]; webcam: MediaAsset | null;
  trimStart: number; trimEnd: number; speed: number; volume: number; clickSounds: boolean;
  webcamShape: EditSettings['webcamShape']; webcamSize: number; webcamPosition: EditSettings['webcamPosition']; webcamDodge: boolean;
  webcamRoundness: number; webcamBorder: number; webcamShadow: number; webcamMirror: boolean;
  /** Whether inspector edits target the selected clip only or the whole project. */
  lookScope: 'clip' | 'all'; setLookScope: (scope: 'clip' | 'all') => void;
  /** Inspector width and timeline height in px, adjustable by dragging. */
  panels: { inspector: number; timeline: number }; setPanels: (patch: Partial<{ inspector: number; timeline: number }>) => void;
  setLook: (patch: Omit<ClipLook, 'canvas' | 'cursor'>) => void; clearClipLook: (id: string) => void;
  selectedZoom: string | null; selectedClip: string | null; selection: 'video' | 'zoom' | 'webcam' | 'background' | null;
  splitPoints: number[]; clips: VideoClip[]; clipsInitialized: boolean; autoZoomPending: boolean;
  snapping: boolean; toggleSnapping: () => void; timelineZoom: number; past: EditSettings[]; future: EditSettings[];
  setEdit: (patch: Partial<Pick<EditorState, 'trimStart' | 'trimEnd' | 'speed' | 'volume' | 'clickSounds'>>) => void;
  loadCapture: (media: MediaAsset, telemetry: TelemetryEvent[], webcam?: MediaAsset) => void;
  loadProject: (project: SavedProject) => void;
  addZoom: () => void; updateZoom: (id: string, patch: Partial<ZoomSegment>) => void; deleteZoom: (id: string) => void;
  selectZoom: (id: string | null) => void; selectClip: (id: string | null) => void;
  selectElement: (element: EditorState['selection']) => void;
  regenerateZooms: () => void; split: () => void; deleteSelected: () => void;
  trimClip: (id: string, start: number, end: number) => void;
  moveClip: (id: string, to: number) => void;
  resetCuts: () => void; checkpoint: () => void; undo: () => void; redo: () => void;
  zoomTimeline: (factor: number) => void;
  setCanvas: (patch: Partial<CanvasSettings>) => void; setCursor: (patch: Partial<CursorSettings>) => void;
  setSource: (source: MediaSource | null) => void; setDuration: (duration: number) => void;
  seekRevision: number; reportTime: (time: number) => void;
  seek: (time: number) => void; seekOutput: (time: number) => void; setPlaying: (playing: boolean) => void; resetAppearance: () => void;
}
export const defaultCanvas: CanvasSettings = { aspectRatio: '16:9', background: 'sonoma', padding: 48, radius: 12, shadow: 50, motionBlur: true, fitMode: 'fit', cropX: 0.5, cropY: 0.5, layout: 'overlay', backgroundType: 'gradient', backgroundColor: '#242430' };
export const defaultCursor: CursorSettings = { size: 24, smoothing: 65, ripple: true, hideWhenIdle: false, style: 'arrow', clickPulse: true, highlight: false, keystrokes: true, keystrokeMode: 'shortcuts' };
const clip = (start: number, end: number, look?: ClipLook): VideoClip => ({ id: crypto.randomUUID(), start, end, ...(look ? { look: structuredClone(look) } : {}) });
/** The clip whose look the inspector edits, or null when edits apply project-wide. */
export function lookTarget(state: Pick<EditorState, 'selection' | 'selectedClip' | 'clips' | 'lookScope'>) {
  if (state.lookScope !== 'clip' || (state.selection !== 'video' && state.selection !== 'webcam') || state.clips.length < 2) return null;
  return state.clips.find(c => c.id === state.selectedClip) ?? null;
}
/** Settings as seen by the inspector: the target clip's overrides on top of the project. */
export function inspectedSettings(state = useEditor.getState()) { return applyLook(editSettings(state), lookTarget(state)?.look); }
const lookKeys = ['webcamShape', 'webcamSize', 'webcamPosition', 'webcamDodge', 'webcamRoundness', 'webcamBorder', 'webcamShadow', 'webcamMirror', 'volume'] as const;
function stripLook(clips: VideoClip[], group: 'canvas' | 'cursor' | null, keys: string[]) {
  return clips.map(c => {
    if (!c.look) return c;
    const look: ClipLook = structuredClone(c.look);
    const target = (group ? look[group] : look) as Record<string, unknown> | undefined;
    if (target) for (const key of keys) delete target[key];
    return { ...c, look };
  });
}
export const useEditor = create<EditorState>()(persist<EditorState, [], [], Pick<EditorState, 'canvas' | 'cursor' | 'panels'>>((set, get) => ({
  seekRevision: 0, reportTime: currentTime => set({ currentTime }),
  canvas: { ...defaultCanvas }, cursor: { ...defaultCursor }, source: null, zooms: [], currentTime: 0, playing: false,
  telemetry: [], webcam: null, trimStart: 0, trimEnd: 0, speed: 1, volume: 1, clickSounds: false,
  webcamShape: 'circle', webcamSize: 20, webcamPosition: 'bottom-right', webcamDodge: true,
  webcamRoundness: 30, webcamBorder: 0, webcamShadow: 40, webcamMirror: false, lookScope: 'clip',
  setLookScope: lookScope => set({ lookScope }),
  panels: { inspector: 320, timeline: 255 },
  setPanels: patch => set(s => ({ panels: { inspector: Math.round(Math.max(260, Math.min(560, patch.inspector ?? s.panels.inspector))), timeline: Math.round(Math.max(200, Math.min(520, patch.timeline ?? s.panels.timeline))) } })),
  setLook: patch => {
    const s = get(); s.checkpoint();
    const clean = Object.fromEntries(Object.entries(patch).filter(([key, value]) => (lookKeys as readonly string[]).includes(key) && value !== undefined));
    if ('volume' in clean) clean.volume = Math.max(0, Math.min(2, Number(clean.volume)));
    const target = lookTarget(s);
    if (target) set({ clips: s.clips.map(c => c.id === target.id ? { ...c, look: { ...c.look, ...clean } } : c) });
    else set({ ...clean, clips: stripLook(s.clips, null, Object.keys(clean)) });
  },
  clearClipLook: id => { get().checkpoint(); set(s => ({ clips: s.clips.map(c => c.id === id ? { id: c.id, start: c.start, end: c.end } : c) })); },
  selectedZoom: null, selectedClip: null, selection: null, splitPoints: [], clips: [], clipsInitialized: false, autoZoomPending: false,
  snapping: true, toggleSnapping: () => set(s => ({ snapping: !s.snapping })), timelineZoom: 1, past: [], future: [],
  checkpoint: () => set(state => ({ past: [...state.past.slice(-49), structuredClone(editSettings(state))], future: [] })),
  undo: () => { const state = get(), snapshot = state.past.at(-1); if (snapshot) set({ ...snapshot, clips: snapshot.clips ?? [], past: state.past.slice(0, -1), future: [...state.future, structuredClone(editSettings(state))], playing: false, selectedClip: null, selectedZoom: null, selection: null, currentTime: sourceAtOutput(snapshot, 0) }); },
  redo: () => { const state = get(), snapshot = state.future.at(-1); if (snapshot) set({ ...snapshot, clips: snapshot.clips ?? [], past: [...state.past, structuredClone(editSettings(state))], future: state.future.slice(0, -1), playing: false, selectedClip: null, selectedZoom: null, selection: null, currentTime: sourceAtOutput(snapshot, 0) }); },
  zoomTimeline: factor => set(state => ({ timelineZoom: Math.max(1, Math.min(32, factor === 0 ? 1 : state.timelineZoom * factor)) })),
  setEdit: patch => {
    get().checkpoint();
    set(state => {
      const start = Math.max(0, Math.min(patch.trimStart ?? state.trimStart, Math.max(0, (state.source?.duration ?? 0) - 0.05)));
      const end = Math.min(state.source?.duration ?? 0, Math.max(start + 0.05, patch.trimEnd ?? state.trimEnd));
      return { ...patch, trimStart: start, trimEnd: end, speed: Math.max(0.25, Math.min(4, patch.speed ?? state.speed)), volume: Math.max(0, Math.min(2, patch.volume ?? state.volume)), playing: false, currentTime: Math.max(start, Math.min(end, state.currentTime)) };
    });
  },
  loadCapture: (media, telemetry, webcam) => { get().setSource({ ...media, duration: 0 }); set({ telemetry, webcam: webcam ?? null, autoZoomPending: true }); },
  loadProject: project => {
    get().setSource({ ...project.media, duration: 0 });
    set({ ...project.settings, canvas: { ...defaultCanvas, ...project.settings.canvas }, clips: project.settings.clips ?? [], clipsInitialized: Array.isArray(project.settings.clips), webcamPosition: project.settings.webcamPosition ?? 'bottom-right', webcamDodge: project.settings.webcamDodge ?? true, webcamRoundness: project.settings.webcamRoundness ?? 30, webcamBorder: project.settings.webcamBorder ?? 0, webcamShadow: project.settings.webcamShadow ?? 40, webcamMirror: project.settings.webcamMirror ?? false, telemetry: project.telemetry, webcam: project.webcam ?? null, currentTime: sourceAtOutput(project.settings, 0) });
  },
  selectZoom: selectedZoom => set({ selectedZoom, selectedClip: null, selection: selectedZoom ? 'zoom' : null }),
  selectClip: selectedClip => set({ selectedClip, selectedZoom: null, selection: selectedClip ? 'video' : null }),
  selectElement: selection => set({ selection, selectedZoom: selection === 'zoom' ? get().selectedZoom : null, selectedClip: selection === 'video' || selection === 'webcam' ? (get().clips.find(c => get().currentTime >= c.start && get().currentTime < c.end)?.id ?? get().clips[0]?.id ?? null) : null }),
  addZoom: () => {
    const state = get(); if (!state.source?.duration) return; state.checkpoint();
    const startTime = Math.min(state.currentTime, Math.max(0, state.source.duration - 0.3)), id = crypto.randomUUID();
    set({ zooms: [...state.zooms, { id, startTime, endTime: Math.min(state.source.duration, startTime + 2), targetX: 0.5, targetY: 0.5, zoomScale: 2 }], selectedZoom: id, selectedClip: null, selection: 'zoom' });
  },
  updateZoom: (id, patch) => set(state => ({ zooms: state.zooms.map(z => {
    if (z.id !== id) return z;
    const next = { ...z, ...patch, id }; if (patch.targetX !== undefined || patch.targetY !== undefined) delete next.keyframes;
    next.startTime = Math.max(0, Math.min(next.startTime, (state.source?.duration ?? 0) - 0.1));
    next.endTime = Math.min(state.source?.duration ?? 0, Math.max(next.startTime + 0.1, next.endTime));
    next.zoomScale = Math.max(1.2, Math.min(3, next.zoomScale)); next.targetX = Math.max(0, Math.min(1, next.targetX)); next.targetY = Math.max(0, Math.min(1, next.targetY)); return next;
  }) })),
  deleteZoom: id => { get().checkpoint(); set(state => ({ zooms: state.zooms.filter(z => z.id !== id), selectedZoom: null, selection: null })); },
  regenerateZooms: () => { get().checkpoint(); set(state => ({ zooms: autoZoom(state.telemetry, state.source?.duration ?? 0), selectedZoom: null })); },
  split: () => {
    const s = get(), index = s.clips.findIndex(c => s.currentTime > c.start + 0.05 && s.currentTime < c.end - 0.05);
    if (index < 0 || s.clips.length >= 500) return; s.checkpoint(); const original = s.clips[index], right = clip(s.currentTime, original.end, original.look);
    const clips = [...s.clips]; clips.splice(index, 1, { ...original, end: s.currentTime }, right);
    set({ clips, selectedClip: right.id, selectedZoom: null, selection: 'video', splitPoints: [...new Set([...s.splitPoints, s.currentTime])].sort((a, b) => a - b) });
  },
  deleteSelected: () => {
    const s = get(); if (s.selectedZoom) { s.deleteZoom(s.selectedZoom); return; }
    if (!s.selectedClip) return; s.checkpoint();
    const index = s.clips.findIndex(c => c.id === s.selectedClip), clips = s.clips.filter(c => c.id !== s.selectedClip);
    set({ clips, selectedClip: null, selection: null, playing: false, currentTime: clips[Math.min(index, clips.length - 1)]?.start ?? 0 });
  },
  trimClip: (id, start, end) => set(s => ({ playing: false, clips: s.clips.map(c => {
    if (c.id !== id || !Number.isFinite(start) || !Number.isFinite(end)) return c;
    const others = s.clips.filter(other => other.id !== id);
    const lower = Math.max(0, ...others.filter(other => other.end <= c.start + 0.00001).map(other => other.end));
    const upper = Math.min(s.source?.duration ?? 0, ...others.filter(other => other.start >= c.end - 0.00001).map(other => other.start));
    const newStart = Math.max(lower, Math.min(start, upper - 0.05, end - 0.05));
    return { ...c, start: newStart, end: Math.min(upper, Math.max(newStart + 0.05, end)) };
  }) })),
  moveClip: (id, to) => { const s = get(), from = s.clips.findIndex(c => c.id === id); if (from < 0 || from === to) return; s.checkpoint(); const clips = [...s.clips]; const [moving] = clips.splice(from, 1); clips.splice(Math.max(0, Math.min(clips.length, to)), 0, moving); set({ clips, playing: false }); },
  resetCuts: () => { const s = get(); s.checkpoint(); set({ clips: s.source?.duration ? [clip(0, s.source.duration)] : [], splitPoints: [], trimStart: 0, trimEnd: s.source?.duration ?? 0, selectedClip: null, selection: null }); },
  setCanvas: patch => set(state => {
    const { aspectRatio, ...look } = patch, target = lookTarget(state);
    if (target) return { canvas: aspectRatio ? { ...state.canvas, aspectRatio } : state.canvas, clips: state.clips.map(c => c.id === target.id ? { ...c, look: { ...c.look, canvas: { ...c.look?.canvas, ...look } } } : c) };
    return { canvas: { ...state.canvas, ...patch }, clips: stripLook(state.clips, 'canvas', Object.keys(look)) };
  }),
  setCursor: patch => set(state => {
    const target = lookTarget(state);
    if (target) return { clips: state.clips.map(c => c.id === target.id ? { ...c, look: { ...c.look, cursor: { ...c.look?.cursor, ...patch } } } : c) };
    return { cursor: { ...state.cursor, ...patch }, clips: stripLook(state.clips, 'cursor', Object.keys(patch)) };
  }),
  setSource: source => {
    const previous = get().source; if (previous?.url.startsWith('blob:') && previous.url !== source?.url) URL.revokeObjectURL(previous.url);
    set({ source, currentTime: 0, playing: false, zooms: [], telemetry: [], webcam: null, trimStart: 0, trimEnd: source?.duration ?? 0, speed: 1, selectedZoom: null, selectedClip: null, selection: null, splitPoints: [], clips: source?.duration ? [clip(0, source.duration)] : [], clipsInitialized: !!source?.duration, autoZoomPending: false, past: [], future: [], timelineZoom: 1 });
  },
  setDuration: duration => set(state => ({ source: state.source ? { ...state.source, duration } : null, clips: state.clipsInitialized ? state.clips.map(c => ({ ...c, end: Math.min(c.end, duration) })).filter(c => c.end > c.start) : [clip(0, duration)], clipsInitialized: true, trimEnd: state.trimEnd > 0 ? Math.min(state.trimEnd, duration) : duration, zooms: state.autoZoomPending ? autoZoom(state.telemetry, duration) : state.zooms, autoZoomPending: false })),
  seek: time => set(s => ({ seekRevision: s.seekRevision + 1, currentTime: Math.max(0, Math.min(Number.isFinite(time) ? time : 0, s.source?.duration ?? 0)) })),
  seekOutput: time => set(s => ({ seekRevision: s.seekRevision + 1, currentTime: sourceAtOutput(s, Math.max(0, Math.min(outputDuration(s), time))) })),
  setPlaying: playing => set({ playing: !!get().source && timelineRanges(get()).length > 0 && playing }),
  resetAppearance: () => set({ canvas: { ...defaultCanvas }, cursor: { ...defaultCursor } }),
}), {
  name: 'recorder-studio-preferences', version: 1, storage: createJSONStorage(() => localStorage), partialize: state => ({ canvas: { ...state.canvas, backgroundImage: undefined, backgroundType: state.canvas.backgroundType === 'image' ? 'gradient' : state.canvas.backgroundType }, cursor: state.cursor, panels: state.panels }),
  merge: (persisted, current) => { const saved = persisted as Partial<EditorState> | undefined; return { ...current, canvas: { ...defaultCanvas, ...saved?.canvas }, cursor: { ...defaultCursor, ...saved?.cursor }, panels: { ...current.panels, ...saved?.panels } }; },
}));
export function editSettings(state = useEditor.getState()): EditSettings {
  const { canvas, cursor, zooms, trimStart, trimEnd, speed, volume, clickSounds, webcamShape, webcamSize, webcamPosition, webcamDodge, webcamRoundness, webcamBorder, webcamShadow, webcamMirror, splitPoints, clips } = state;
  return { canvas, cursor, zooms, trimStart, trimEnd, speed, volume, clickSounds, webcamShape, webcamSize, webcamPosition, webcamDodge, webcamRoundness, webcamBorder, webcamShadow, webcamMirror, splitPoints, clips };
}
