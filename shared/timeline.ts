import type { EditSettings } from './api.js';
import type { ClipLook, VideoClip } from './project.js';
export interface TimelineRange { id: string; start: number; end: number; outputStart: number; outputEnd: number }
/** Every component, decoder and audio exporter uses this exact source-to-project mapping. */
export function timelineRanges(settings: Pick<EditSettings, 'clips' | 'trimStart' | 'trimEnd' | 'speed'>): TimelineRange[] {
  const clips = settings.clips ?? [{ id: 'original', start: settings.trimStart, end: settings.trimEnd }];
  let offset = 0;
  return clips.flatMap(clip => {
    const start = Math.max(clip.start, settings.trimStart), end = Math.min(clip.end, settings.trimEnd);
    if (end - start < 0.001) return [];
    const outputStart = offset; offset += (end - start) / settings.speed;
    return [{ id: clip.id, start, end, outputStart, outputEnd: offset }];
  });
}
export function outputDuration(settings: Pick<EditSettings, 'clips' | 'trimStart' | 'trimEnd' | 'speed'>) { return timelineRanges(settings).at(-1)?.outputEnd ?? 0; }
export function sourceAtOutput(settings: Pick<EditSettings, 'clips' | 'trimStart' | 'trimEnd' | 'speed'>, output: number) {
  const ranges = timelineRanges(settings);
  const range = ranges.find(range => output < range.outputEnd - 1e-8) ?? ranges.at(-1);
  if (!range) return 0;
  return Math.min(range.end - 0.00001, range.start + Math.max(0, output - range.outputStart) * settings.speed);
}
export function outputAtSource(settings: Pick<EditSettings, 'clips' | 'trimStart' | 'trimEnd' | 'speed'>, source: number) {
  const ranges = timelineRanges(settings);
  const range = ranges.find(range => source >= range.start - 1e-7 && source < range.end - 1e-7) ?? ranges.find(range => Math.abs(source - range.end) < 0.001);
  return range ? range.outputStart + (Math.min(range.end, Math.max(range.start, source)) - range.start) / settings.speed : 0;
}
/** Clips never overlap in source time, so a source time identifies at most one clip. */
export function clipAtSource(clips: VideoClip[] | undefined, source: number) {
  return clips?.find(clip => source >= clip.start - 1e-7 && source < clip.end - 1e-7) ?? clips?.find(clip => Math.abs(source - clip.end) < 0.001);
}
/** Applies a clip's look overrides on top of the project-wide settings. */
export function applyLook(settings: EditSettings, look: ClipLook | undefined): EditSettings {
  if (!look) return settings;
  const { canvas, cursor, ...rest } = look;
  return { ...settings, ...rest, canvas: { ...settings.canvas, ...canvas }, cursor: { ...settings.cursor, ...cursor } };
}
export function settingsAt(settings: EditSettings, source: number) { return applyLook(settings, clipAtSource(settings.clips, source)?.look); }
