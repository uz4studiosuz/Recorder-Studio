import { beforeEach, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { useEditor, editSettings, inspectedSettings } from './editor';
import { settingsAt } from '../../shared/timeline';
import { keystrokeBubbles, bubbleAt } from '../engine/keystrokes';
import { demux } from '../engine/decoder';
beforeEach(() => { useEditor.getState().setSource({ id: 'test', name: 'test.mp4', url: 'studio://media/test', duration: 10 }); });
it('applies inspector changes only to the selected clip after a split', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  const [left, right] = useEditor.getState().clips;
  state.selectClip(right.id); state.setCanvas({ padding: 100, aspectRatio: '1:1' }); state.setLook({ webcamShape: 'rectangle', volume: 0.5 });
  const settings = editSettings();
  expect(settingsAt(settings, 2).canvas.padding).toBe(48);
  expect(settingsAt(settings, 6).canvas.padding).toBe(100);
  expect(settingsAt(settings, 6).webcamShape).toBe('rectangle');
  expect(settingsAt(settings, 2).volume).toBe(1);
  expect(settings.canvas.aspectRatio).toBe('1:1');
  expect(inspectedSettings().canvas.padding).toBe(100);
  state.selectClip(left.id); expect(inspectedSettings().canvas.padding).toBe(48);
});
it('applies to every clip in All clips mode and clears clip overrides', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  const right = useEditor.getState().clips[1];
  state.selectClip(right.id); state.setCanvas({ padding: 100 });
  state.setLookScope('all'); state.setCanvas({ padding: 10 });
  expect(settingsAt(editSettings(), 6).canvas.padding).toBe(10);
  expect(settingsAt(editSettings(), 2).canvas.padding).toBe(10);
  state.setLookScope('clip');
});
it('splitting a customized clip keeps the look on both halves', () => {
  const state = useEditor.getState(); state.seek(4); state.split();
  state.selectClip(useEditor.getState().clips[1].id); state.setCursor({ style: 'ring' });
  state.seek(7); state.split();
  expect(useEditor.getState().clips.map(c => c.look?.cursor?.style)).toEqual([undefined, 'ring', 'ring']);
});
it('groups typing into words and keeps shortcuts as separate bubbles', () => {
  const key = (timeMs: number, key: string) => ({ timeMs, x: -1, y: -1, kind: 'key' as const, key });
  const events = [key(0, 'h'), key(100, 'i'), key(500, 'Ctrl+S'), key(5000, 'x')];
  expect(keystrokeBubbles(events, 'shortcuts').map(b => b.items[0].text)).toEqual(['Ctrl+S']);
  const all = keystrokeBubbles(events, 'all');
  expect(all).toHaveLength(3);
  expect(bubbleAt(all, 0.2)?.text).toBe('hi');
  expect(bubbleAt(all, 0.6)?.text).toBe('Ctrl+S');
  expect(bubbleAt(all, 3)).toBeNull();
});
it.skipIf(!existsSync('.integration/fixture.mp4'))('demuxes an MP4 sample table for sequential decoding', async () => {
  const file = readFileSync('.integration/fixture.mp4');
  const track = await demux(async (offset, length) => new Uint8Array(file.subarray(offset, offset + length)), file.length);
  expect(track.codec).toMatch(/^avc1\./);
  expect(track.pts.length).toBeGreaterThan(10);
  expect(track.keys[0]).toBe(1);
  expect(Math.min(...track.pts)).toBeLessThan(50_000);
  // Sample data must start with an AVCC length prefix that fits inside the sample.
  const first = file.subarray(track.offsets[0], track.offsets[0] + track.sizes[0]);
  expect(first.readUInt32BE(0)).toBeLessThanOrEqual(track.sizes[0] - 4);
});
