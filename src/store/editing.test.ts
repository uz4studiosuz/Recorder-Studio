import { beforeEach, expect, it } from 'vitest';
import { useEditor, editSettings } from './editor';
beforeEach(() => { useEditor.getState().setSource({ id: 'test', name: 'test.mp4', url: 'studio://media/test', duration: 10 }); });
it('keeps a resized zoom in bounds and deletes it', () => {
  const state = useEditor.getState(); state.seek(9.9); state.addZoom();
  const zoom = useEditor.getState().zooms[0];
  state.updateZoom(zoom.id, { startTime: -8, endTime: 100, zoomScale: 9, targetY: -1 });
  expect(useEditor.getState().zooms[0]).toMatchObject({ startTime: 0, endTime: 10, zoomScale: 3, targetY: 0 });
  state.deleteZoom(zoom.id); expect(useEditor.getState().zooms).toHaveLength(0);
});
it('bounds trims, constrains playhead, and retains an actual split point', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  expect(useEditor.getState().splitPoints).toEqual([4]);
  state.setEdit({ trimStart: 5, trimEnd: 7, speed: 50 });
  expect(useEditor.getState()).toMatchObject({ trimStart: 5, trimEnd: 7, currentTime: 5, speed: 4 });
});
it('does not regenerate deleted zooms when reopening a saved project', () => {
  const state = useEditor.getState();
  const media = { id: 'test', name: 'test.mp4', url: 'studio://media/test' };
  state.loadCapture(media, [{ kind: 'mousedown', timeMs: 500, x: 0.5, y: 0.5 }]); state.setDuration(2);
  expect(useEditor.getState().zooms).toHaveLength(1);
  const zoom = useEditor.getState().zooms[0]; state.deleteZoom(zoom.id);
  state.loadProject({ version: 1, media, telemetry: useEditor.getState().telemetry, settings: editSettings() });
  state.setDuration(2);
  expect(useEditor.getState().zooms).toEqual([]);
});
