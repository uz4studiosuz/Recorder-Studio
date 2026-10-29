import type { TelemetryEvent, ZoomSegment } from '../../shared/project';
export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export function autoZoom(events: TelemetryEvent[], duration: number): ZoomSegment[] {
  const clicks = events.filter(e => (e.kind === 'mousedown' || e.kind === 'marker') && e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1 && e.timeMs / 1000 < duration);
  const groups: TelemetryEvent[][] = [];
  for (const click of clicks) {
    const previous = groups.at(-1);
    if (previous && click.timeMs - previous.at(-1)!.timeMs <= 1500) previous.push(click);
    else groups.push([click]);
  }
  return groups.map((group, index) => ({ id: `auto-${index}`, startTime: Math.max(0, group[0].timeMs / 1000 - 0.45), endTime: Math.min(duration, group.at(-1)!.timeMs / 1000 + 1.1), targetX: group[0].x, targetY: group[0].y, zoomScale: 2, keyframes: group.map(e => ({ time: e.timeMs / 1000, x: e.x, y: e.y })) }));
}
export function rawPointer(events: TelemetryEvent[], time: number) {
  if (!events.length) return null;
  const ms = time * 1000;
  let lo = 0, hi = events.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (events[mid].timeMs <= ms) lo = mid; else hi = mid - 1; }
  const a = events[lo], b = events[Math.min(lo + 1, events.length - 1)];
  const interpolationStart = Math.max(a.timeMs, b.timeMs - 80);
  const t = a === b ? 0 : clamp((ms - interpolationStart) / Math.max(1, b.timeMs - interpolationStart));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, idle: ms - a.timeMs };
}
/** Fixed-step critical damping is precomputed once; evaluation is independent of playback/render cadence. */
export function smoothPointer(events: TelemetryEvent[], smoothing: number) {
  if (!events.length || smoothing === 0) return (time: number) => rawPointer(events, time);
  const dt = 1 / 120, omega = 14 + (100 - smoothing) * 0.9;
  const count = Math.ceil(events.at(-1)!.timeMs / 1000 / dt) + 2;
  const samples = new Float32Array(count * 2);
  let x = events[0].x, y = events[0].y, vx = 0, vy = 0;
  for (let i = 0; i < count; i++) {
    const target = rawPointer(events, i * dt)!;
    const decay = Math.exp(-omega * dt);
    const dx = x - target.x, dy = y - target.y;
    const cx = vx + omega * dx, cy = vy + omega * dy;
    x = target.x + (dx + cx * dt) * decay; y = target.y + (dy + cy * dt) * decay;
    vx = (vx - omega * cx * dt) * decay; vy = (vy - omega * cy * dt) * decay;
    samples[i * 2] = x; samples[i * 2 + 1] = y;
  }
  return (time: number) => {
    const f = clamp(time / dt, 0, count - 1), a = Math.floor(f), b = Math.min(count - 1, a + 1), t = f - a;
    return { x: samples[a * 2] * (1 - t) + samples[b * 2] * t, y: samples[a * 2 + 1] * (1 - t) + samples[b * 2 + 1] * t, idle: rawPointer(events, time)!.idle };
  };
}
export function cameraAt(zooms: ZoomSegment[], time: number) {
  let strength = 0, scale = 1, x = 0.5, y = 0.5;
  for (const segment of [...zooms].sort((a, b) => a.startTime - b.startTime)) {
    if (time < segment.startTime || time > segment.endTime) continue;
    const ramp = Math.min(0.45, (segment.endTime - segment.startTime) / 3);
    const amount = ease((time - segment.startTime) / ramp) * ease((segment.endTime - time) / ramp);
    let targetX = segment.targetX, targetY = segment.targetY;
    const keys = segment.keyframes;
    if (keys?.length) {
      targetX = keys[0].x; targetY = keys[0].y;
      for (let index = 1; index < keys.length; index++) {
        const previous = keys[index - 1], key = keys[index];
        const fraction = ease((time - key.time + 0.15) / 0.35);
        targetX = previous.x + (key.x - previous.x) * fraction;
        targetY = previous.y + (key.y - previous.y) * fraction;
        if (fraction < 1) break;
      }
    }
    scale += (segment.zoomScale - scale) * amount;
    x += (targetX - x) * amount; y += (targetY - y) * amount;
    strength = Math.max(strength, amount);
  }
  return { scale, x: clamp(x, 0.5 / scale, 1 - 0.5 / scale), y: clamp(y, 0.5 / scale, 1 - 0.5 / scale), strength };
}
