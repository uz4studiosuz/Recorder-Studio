import type { TelemetryEvent } from '../../shared/project';
import { chalkSample, dragGestures } from '../../shared/pointer-audio';
export function pointerSounds(events: TelemetryEvent[]) {
  const clicks = events.filter(event => event.kind === 'mousedown'), drags = dragGestures(events);
  let context: AudioContext | undefined, previous = -1, lastDrag = -1;
  const play = (duration: number, drag: boolean) => {
    context ??= new AudioContext(); void context.resume().catch(() => {});
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = drag ? chalkSample(i, context.sampleRate, duration) : Math.sin(i / context.sampleRate * 1600 * Math.PI * 2) * Math.exp(-i / (context.sampleRate * 0.0023)) * 0.13;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start();
  };
  return {
    update(time: number, enabled: boolean) {
      if (!enabled) { previous = -1; lastDrag = -1; return; }
      if (previous >= 0 && time >= previous && time - previous < 0.2) {
        if (clicks.some(click => click.timeMs / 1000 > previous && click.timeMs / 1000 <= time)) play(0.02, false);
        if (time - lastDrag > 0.055 && drags.some(drag => time >= drag.start && time < drag.end)) { play(0.07, true); lastDrag = time; }
      }
      previous = time;
    },
    close() { if (context) void context.close().catch(() => {}); },
  };
}
