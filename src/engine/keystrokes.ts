import type { TelemetryEvent } from '../../shared/project';

export interface KeystrokeBubble { kind: 'combo' | 'text'; start: number; end: number; items: { time: number; text: string }[] }
const HOLD = 1.3, TYPING_GAP = 1.1, MAX_TEXT = 28;
/** A label is a shortcut when it has a modifier or names a non-printing key (Enter, Esc, F5…). */
export const isShortcut = (label: string) => label.length > 1 && label !== 'Space';
/** Groups recorded keys into on-screen bubbles: shortcuts stand alone, typed characters join into words. */
export function keystrokeBubbles(events: TelemetryEvent[], mode: 'shortcuts' | 'all' = 'shortcuts'): KeystrokeBubble[] {
  const bubbles: KeystrokeBubble[] = [];
  for (const event of events) {
    if (event.kind !== 'key' || !event.key) continue;
    const time = event.timeMs / 1000, label = event.key, combo = isShortcut(label);
    if (!combo && mode === 'shortcuts') continue;
    const previous = bubbles.at(-1);
    if (!combo && previous?.kind === 'text' && time - previous.items.at(-1)!.time < TYPING_GAP) {
      previous.items.push({ time, text: label === 'Space' ? ' ' : label }); previous.end = time + HOLD; continue;
    }
    // A new bubble replaces the previous one on screen.
    if (previous && previous.end > time) previous.end = time;
    bubbles.push({ kind: combo ? 'combo' : 'text', start: time, end: time + HOLD, items: [{ time, text: label === 'Space' ? ' ' : label }] });
  }
  return bubbles;
}
export function bubbleAt(bubbles: KeystrokeBubble[], time: number) {
  let lo = 0, hi = bubbles.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bubbles[mid].start <= time) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  const bubble = bubbles[found];
  if (!bubble || time > bubble.end) return null;
  const text = bubble.items.filter(item => item.time <= time).map(item => item.text).join('');
  const fadeIn = Math.min(1, (time - bubble.start) / 0.12), fadeOut = Math.min(1, (bubble.end - time) / 0.25);
  return { kind: bubble.kind, text: bubble.kind === 'text' && text.length > MAX_TEXT ? `…${text.slice(-MAX_TEXT)}` : text, opacity: Math.max(0, Math.min(fadeIn, fadeOut)), pop: fadeIn };
}
