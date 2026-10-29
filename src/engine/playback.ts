import { outputAtSource, outputDuration, sourceAtOutput, timelineRanges } from '../../shared/timeline';
import type { EditSettings } from '../../shared/api';
/** Playback follows project time. Decoder seek events can never move the playhead. */
export class PlaybackClock {
  private output = 0;
  private wall = 0;
  reset(settings: EditSettings, source: number, now: number) { this.output = outputAtSource(settings, source); this.wall = now; }
  at(settings: EditSettings, now: number) {
    const duration = outputDuration(settings), output = Math.min(duration, this.output + Math.max(0, now - this.wall) / 1000);
    const source = sourceAtOutput(settings, output);
    const ranges = timelineRanges(settings), range = ranges.find(r => output < r.outputEnd - 1e-8) ?? ranges.at(-1);
    return { source, output, range, next: ranges[ranges.findIndex(r => r.id === range?.id) + 1], ended: output >= duration };
  }
}
