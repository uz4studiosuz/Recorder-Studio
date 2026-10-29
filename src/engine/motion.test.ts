import { describe, expect, it } from 'vitest';
import { autoZoom, cameraAt, rawPointer, smoothPointer } from './motion';
import type { TelemetryEvent } from '../../shared/project';
const click = (timeMs: number, x = 0.7): TelemetryEvent => ({ timeMs, x, y: 0.3, kind: 'mousedown' });
describe('deterministic camera and telemetry', () => {
  it('groups successive clicks at a 1500ms boundary and clamps segments to media duration', () => {
    const groups = autoZoom([click(100), click(1600), click(3101), click(8000)], 5);
    expect(groups).toHaveLength(2);
    expect(groups[0].startTime).toBe(0);
    expect(groups[0].endTime).toBeCloseTo(2.7);
    expect(groups[1].endTime).toBeLessThanOrEqual(5);
  });
  it('never creates a zoom from an off-capture click', () => {
    expect(autoZoom([click(100, -0.2), click(200, 1.1)], 3)).toEqual([]);
  });
  it('returns to scale 1 at boundaries and constrains focus to avoid empty edges', () => {
    const zoom = { id: 'z', startTime: 1, endTime: 3, targetX: 1, targetY: 0, zoomScale: 3 };
    expect(cameraAt([zoom], 1).scale).toBe(1);
    expect(cameraAt([zoom], 3).scale).toBe(1);
    const middle = cameraAt([zoom], 2);
    expect(middle.scale).toBe(3);
    expect(middle.x).toBeCloseTo(5 / 6);
    expect(middle.y).toBeCloseTo(1 / 6);
  });
  it('interpolates raw telemetry and evaluates springs identically when seeking backwards', () => {
    const events = Array.from({ length: 61 }, (_, index) => click(index * 1000 / 60, index / 60));
    expect(rawPointer(events, 0.5)?.x).toBe(0.5);
    const spring = smoothPointer(events, 70);
    const first = spring(0.6); spring(1); spring(0.1);
    expect(spring(0.6)).toEqual(first);
    expect(first!.x).toBeGreaterThan(0);
    expect(first!.x).toBeLessThan(0.6);
  });
});
