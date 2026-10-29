import { expect, it } from 'vitest';
import { PlaybackClock } from './playback';
import { editSettings } from '../store/editor';
it('starts at a scrubbed minute and crosses a cut without returning to zero', () => {
  const settings = { ...editSettings(), trimStart: 0, trimEnd: 180, speed: 1, clips: [{ id: 'a', start: 0, end: 65 }, { id: 'b', start: 90, end: 180 }] };
  const clock = new PlaybackClock(); clock.reset(settings, 60, 1000);
  expect(clock.at(settings, 2000).source).toBeCloseTo(61);
  expect(clock.at(settings, 6100).source).toBeCloseTo(90.1);
  expect(clock.at(settings, 6100).range?.id).toBe('b');
});
it('follows reordered clips and resets the anchor on a deliberate seek', () => {
  const settings = { ...editSettings(), trimStart: 0, trimEnd: 100, speed: 2, clips: [{ id: 'a', start: 50, end: 60 }, { id: 'b', start: 10, end: 20 }] };
  const clock = new PlaybackClock(); clock.reset(settings, 58, 0);
  expect(clock.at(settings, 1100).source).toBeCloseTo(10.2);
  clock.reset(settings, 15, 2000); expect(clock.at(settings, 2500).source).toBeCloseTo(16);
});
