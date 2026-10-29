import type { EditSettings } from '../shared/api.js';
import { cursorStyles, webcamShapes, type TelemetryEvent } from '../shared/project.js';
const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center', 'top-center'];
const lookKeys = ['webcamShape', 'webcamSize', 'webcamPosition', 'webcamDodge', 'webcamRoundness', 'webcamBorder', 'webcamShadow', 'webcamMirror', 'volume'];
/** Checks fields that a clip look may override, on the merged settings. */
function look(value: EditSettings) {
  const finite = (n: unknown, min: number, max: number) => n === undefined || typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const c = value.canvas, p = value.cursor;
  if (!finite(value.webcamRoundness, 0, 100) || !finite(value.webcamBorder, 0, 24) || !finite(value.webcamShadow, 0, 100) || !finite(value.volume, 0, 2) || !finite(value.webcamSize, 8, 45) || ![undefined, true, false].includes(value.webcamMirror)) throw new Error('Invalid webcam look');
  if (!(webcamShapes as readonly string[]).includes(value.webcamShape) || !positions.includes(value.webcamPosition) || typeof value.webcamDodge !== 'boolean') throw new Error('Invalid webcam look');
  if (!finite(c.splitRatio, 0.2, 0.6) || ![undefined, 'left', 'right'].includes(c.splitSide) || !finite(c.padding, 0, 120) || !finite(c.radius, 0, 48) || !finite(c.shadow, 0, 100) || !finite(c.cropX, 0, 1) || !finite(c.cropY, 0, 1)) throw new Error('Invalid canvas look');
  if (c.layout !== undefined && !['screen', 'camera', 'split', 'overlay', 'cutout'].includes(c.layout) || !['fit', 'fill', 'follow'].includes(c.fitMode) || !['sonoma', 'dusk', 'ocean', 'peach', 'forest', 'graphite'].includes(c.background)) throw new Error('Invalid canvas look');
  if (c.backgroundType !== undefined && !['gradient', 'color', 'image'].includes(c.backgroundType) || c.backgroundColor !== undefined && !/^#[0-9a-f]{6}$/i.test(c.backgroundColor)) throw new Error('Invalid canvas look');
  if (c.backgroundImage !== undefined && (typeof c.backgroundImage !== 'string' || c.backgroundImage.length > 12_000_000 || !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(c.backgroundImage))) throw new Error('Invalid background image');
  if (!finite(p.size, 12, 64) || !finite(p.smoothing, 0, 100) || !(cursorStyles as readonly string[]).includes(p.style) || ![undefined, 'shortcuts', 'all'].includes(p.keystrokeMode) || [p.clickPulse, p.highlight, p.keystrokes, p.ripple, p.hideWhenIdle].some(flag => ![undefined, true, false].includes(flag))) throw new Error('Invalid cursor look');
}

export function settings(value: EditSettings) {
  if (!value || !value.canvas || !value.cursor || !Array.isArray(value.zooms) || value.zooms.length > 10000) throw new Error('Invalid project settings');
  const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  if (!finite(value.trimStart, 0, 86400) || !finite(value.trimEnd, value.trimStart, 86400) || !finite(value.speed, 0.25, 4) || !finite(value.volume, 0, 2) || !finite(value.webcamSize, 8, 45)) throw new Error('Invalid edit range');
  const c = value.canvas; const p = value.cursor;
  const only = (object: object, keys: string[]) => Object.keys(object).every(key => keys.includes(key));
  if (!only(value, ['canvas', 'cursor', 'zooms', 'trimStart', 'trimEnd', 'speed', 'volume', 'clickSounds', 'webcamShape', 'webcamSize', 'webcamPosition', 'webcamDodge', 'webcamRoundness', 'webcamBorder', 'webcamShadow', 'webcamMirror', 'splitPoints', 'clips']) || !only(c, ['aspectRatio', 'background', 'padding', 'radius', 'shadow', 'motionBlur', 'fitMode', 'cropX', 'cropY', 'layout', 'backgroundType', 'backgroundColor', 'backgroundImage', 'splitRatio', 'splitSide']) || !only(p, ['size', 'smoothing', 'ripple', 'hideWhenIdle', 'style', 'clickPulse', 'highlight', 'keystrokes', 'keystrokeMode'])) throw new Error('Unexpected project fields');
  if (c.layout !== undefined && !['screen', 'camera', 'split', 'overlay', 'cutout'].includes(c.layout)) throw new Error('Invalid composition');
  if (c.backgroundType !== undefined && !['gradient', 'color', 'image'].includes(c.backgroundType)) throw new Error('Invalid background type');
  if (c.backgroundColor !== undefined && !/^#[0-9a-f]{6}$/i.test(c.backgroundColor)) throw new Error('Invalid background color');
  if (c.backgroundImage !== undefined && (typeof c.backgroundImage !== 'string' || c.backgroundImage.length > 12_000_000 || !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(c.backgroundImage))) throw new Error('Invalid background image');
  if (!Array.isArray(value.splitPoints) || value.splitPoints.length > 10000 || !value.splitPoints.every(point => finite(point, 0, 86400))) throw new Error('Invalid split points');
  if (value.clips !== undefined && (!Array.isArray(value.clips) || value.clips.length > 500 || !value.clips.every(clip => clip && typeof clip.id === 'string' && finite(clip.start, 0, 86400) && finite(clip.end, clip.start + 0.01, 86400)))) throw new Error('Invalid video clips');
  if (value.clips && new Set(value.clips.map(clip => clip.id)).size !== value.clips.length) throw new Error('Duplicate clip IDs');
  if (!['fit', 'fill', 'follow'].includes(c.fitMode) || !finite(c.cropX, 0, 1) || !finite(c.cropY, 0, 1)) throw new Error('Invalid framing');
  if (!['16:9', '9:16', '1:1', '4:3'].includes(c.aspectRatio) || !['sonoma', 'dusk', 'ocean', 'peach', 'forest', 'graphite'].includes(c.background) || !finite(c.padding, 0, 120) || !finite(c.radius, 0, 48) || !finite(c.shadow, 0, 100) || !finite(p.size, 12, 64) || !finite(p.smoothing, 0, 100) || !(cursorStyles as readonly string[]).includes(p.style)) throw new Error('Invalid canvas or cursor');
  look(value);
  for (const clip of value.clips ?? []) if (clip.look !== undefined) { if (!clip.look || typeof clip.look !== 'object' || !only(clip.look, [...lookKeys, 'canvas', 'cursor'])) throw new Error('Invalid clip look'); look({ ...value, ...clip.look, canvas: { ...c, ...clip.look.canvas }, cursor: { ...p, ...clip.look.cursor } }); }
  for (const z of value.zooms) if (typeof z.id !== 'string' || !finite(z.startTime, 0, 86400) || !finite(z.endTime, z.startTime + 0.01, 86400) || !finite(z.targetX, 0, 1) || !finite(z.targetY, 0, 1) || !finite(z.zoomScale, 1.2, 3)) throw new Error('Invalid zoom segment');
  for (const z of value.zooms) if (z.keyframes && (!Array.isArray(z.keyframes) || z.keyframes.length > 10000 || !z.keyframes.every(key => finite(key.time, 0, 86400) && finite(key.x, 0, 1) && finite(key.y, 0, 1)))) throw new Error('Invalid camera keyframes');
  if (typeof c.motionBlur !== 'boolean' || typeof p.ripple !== 'boolean' || typeof p.hideWhenIdle !== 'boolean' || typeof value.clickSounds !== 'boolean' || !(webcamShapes as readonly string[]).includes(value.webcamShape) || !positions.includes(value.webcamPosition) || typeof value.webcamDodge !== 'boolean') throw new Error('Invalid project flags');
  return value;
}
export function telemetry(events: TelemetryEvent[]) {
  if (!Array.isArray(events) || events.length > 2_000_000) throw new Error('Invalid telemetry');
  let previous = -1;
  for (const e of events) {
    if (!e || !Number.isFinite(e.timeMs) || e.timeMs < previous || !Number.isFinite(e.x) || !Number.isFinite(e.y) || Math.abs(e.x) > 100 || Math.abs(e.y) > 100 || !['move', 'mousedown', 'mouseup', 'marker', 'key'].includes(e.kind) || e.key !== undefined && (typeof e.key !== 'string' || e.key.length > 40)) throw new Error('Invalid telemetry event');
    previous = e.timeMs;
  }
  return events;
}
