import { expect, it } from 'vitest';
import { snapTime } from './snapping';
it('keeps the same pixel snapping distance as the timeline zoom changes', () => {
  expect(snapTime(0.92, [0, 1, 2], 100)).toEqual({ time: 1, snapped: true });
  expect(snapTime(0.92, [0, 1, 2], 200)).toEqual({ time: 0.92, snapped: false });
  expect(snapTime(0.96, [0, 1, 2], 200).time).toBe(1);
});
it('uses the nearest boundary and supports bypassing snapping', () => {
  expect(snapTime(1.06, [1, 1.1], 100).time).toBe(1.1);
  expect(snapTime(1.06, [1, 1.1], 100, false).snapped).toBe(false);
});
