import { expect, it } from 'vitest';
import { dragGestures, chalkSample } from '../../shared/pointer-audio';
it('does not turn clicks or hovering into drag sounds', () => {
  expect(dragGestures([{ kind: 'move', timeMs: 0, x: 0, y: 0 }, { kind: 'mousedown', timeMs: 100, x: 0, y: 0 }, { kind: 'mouseup', timeMs: 130, x: 0, y: 0 }])).toEqual([]);
});
it('bounds the screech by real dragging and releases the button', () => {
  const gestures = dragGestures([{ kind: 'mousedown', timeMs: 0, x: 0, y: 0 }, { kind: 'move', timeMs: 100, x: 0.1, y: 0.1 }, { kind: 'move', timeMs: 200, x: 0.2, y: 0.2 }, { kind: 'mouseup', timeMs: 220, x: 0.2, y: 0.2 }, { kind: 'move', timeMs: 300, x: 0.4, y: 0.4 }]);
  expect(gestures).toHaveLength(1); expect(gestures[0].start).toBeCloseTo(0.06); expect(gestures[0].end).toBeCloseTo(0.22);
  expect(Math.abs(chalkSample(2400, 48000, 0.2))).toBeLessThan(0.1);
});
