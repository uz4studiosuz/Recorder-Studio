import type { TelemetryEvent } from './project.js';
export interface DragGesture { start: number; end: number }
export function dragGestures(events: TelemetryEvent[]): DragGesture[] {
  const result: DragGesture[] = []; let held: TelemetryEvent | undefined, last: TelemetryEvent | undefined, active: DragGesture | undefined;
  for (const event of events) {
    if (event.kind === 'mousedown') { held = last = event; active = undefined; }
    if (event.kind === 'move' && held && last) {
      const moved = Math.hypot(event.x - last.x, event.y - last.y) > 0.001;
      if (moved && event.timeMs - held.timeMs > 70) {
        const time = event.timeMs / 1000;
        if (!active || time - active.end > 0.15) { active = { start: Math.max(held.timeMs / 1000 + 0.03, time - 0.04), end: time + 0.05 }; result.push(active); }
        else active.end = time + 0.05;
      }
      last = event;
    }
    if (event.kind === 'mouseup') { if (active) active.end = Math.min(active.end, event.timeMs / 1000); held = last = undefined; active = undefined; }
  }
  return result.filter(gesture => gesture.end - gesture.start >= 0.025);
}
/** A restrained chalk squeak: two rubbing tones with deterministic roughness. */
export function chalkSample(index: number, rate: number, duration: number) {
  const time = index / rate, fade = Math.min(1, time / 0.015, (duration - time) / 0.025);
  const frequency = 1350 + 180 * Math.sin(time * 29), roughness = Math.sin(index * 12.9898) * 43758.5453 % 1;
  return Math.max(0, fade) * (Math.sin(2 * Math.PI * frequency * time) * 0.055 + Math.sin(2 * Math.PI * 2380 * time + Math.sin(time * 45)) * 0.026 + roughness * 0.009);
}
