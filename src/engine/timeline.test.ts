import { beforeEach, expect, it } from 'vitest';
import { useEditor, editSettings } from '../store/editor';
import { outputDuration, outputAtSource, sourceAtOutput, timelineRanges } from '../../shared/timeline';
beforeEach(() => useEditor.getState().setSource({ name: 'clip.mp4', url: 'studio://media/test', duration: 10 }));
it('splits, ripple-deletes the middle, and maps the retained ranges without a gap', () => {
  const state = useEditor.getState(); state.seek(3); state.split(); state.seek(7); state.split();
  state.selectClip(useEditor.getState().clips[1].id); state.deleteSelected();
  const settings = editSettings();
  expect(settings.clips?.map(c => [c.start, c.end])).toEqual([[0, 3], [7, 10]]);
  expect(outputDuration(settings)).toBe(6);
  expect(sourceAtOutput(settings, 3)).toBe(7);
  expect(outputAtSource(settings, 8)).toBe(4);
  state.undo(); expect(outputDuration(editSettings())).toBe(10);
  state.redo(); expect(outputDuration(editSettings())).toBe(6);
});
it('exports and seeks in reordered clip order with speed applied', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  const right = useEditor.getState().clips[1]; state.moveClip(right.id, 0); state.setEdit({ speed: 2 });
  expect(sourceAtOutput(editSettings(), 0)).toBe(4);
  expect(sourceAtOutput(editSettings(), 3)).toBe(0);
  expect(timelineRanges(editSettings()).at(-1)?.outputEnd).toBe(5);
});
it('does not permit clip trims to overlap adjacent source ranges', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  const second = useEditor.getState().clips[1]; state.trimClip(second.id, 1, 9);
  expect(useEditor.getState().clips[1].start).toBe(4);
});
it('keeps an all-deleted timeline empty until reset, and clamps zoom', () => {
  const state = useEditor.getState(); state.selectClip(useEditor.getState().clips[0].id); state.deleteSelected(); state.setDuration(10);
  expect(outputDuration(editSettings())).toBe(0); state.resetCuts(); expect(outputDuration(editSettings())).toBe(10);
  state.zoomTimeline(100); expect(useEditor.getState().timelineZoom).toBe(32); state.zoomTimeline(0); expect(useEditor.getState().timelineZoom).toBe(1);
});
