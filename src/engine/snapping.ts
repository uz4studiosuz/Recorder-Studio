/** Adapted from OpenCut Classic's MIT timeline snapping resolver/threshold.
 * Copyright 2025-2026 OpenCut. Full notice: THIRD_PARTY_OPENCUT_LICENSE.
 */
export function snapTime(time: number, points: number[], pixelsPerSecond: number, enabled = true) {
  if (!enabled || pixelsPerSecond <= 0) return { time, snapped: false };
  let closest = time, distance = Infinity;
  for (const point of points) {
    const delta = Math.abs(point - time);
    if (delta <= 10 / pixelsPerSecond && delta < distance) { closest = point; distance = delta; }
  }
  return { time: closest, snapped: distance !== Infinity };
}
