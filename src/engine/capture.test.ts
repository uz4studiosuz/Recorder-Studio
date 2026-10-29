import { afterEach, expect, it, vi } from 'vitest';
import { writeTrack } from './capture';
import type { RecorderAPI } from '../../shared/api';
class Encoder extends EventTarget {
  static isTypeSupported() { return true; }
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('fails with a recovery message instead of waiting forever for MediaRecorder stop', async () => {
  vi.useFakeTimers(); vi.stubGlobal('MediaRecorder', Encoder);
  const api = { beginTrack: vi.fn().mockResolvedValue(undefined) } as unknown as RecorderAPI;
  const writer = await writeTrack(api, 'webcam', {} as MediaStream, vi.fn());
  const stopped = writer.stop(); const assertion = expect(stopped).rejects.toThrow('encoder did not finish');
  await vi.advanceTimersByTimeAsync(15001); await assertion;
});
it('does not send queued data into a later recording after cancellation', async () => {
  vi.stubGlobal('MediaRecorder', Encoder);
  const append = vi.fn().mockResolvedValue(undefined), error = vi.fn();
  const api = { beginTrack: vi.fn().mockResolvedValue(undefined), appendTrack: append } as unknown as RecorderAPI;
  const writer = await writeTrack(api, 'audio', {} as MediaStream, error);
  (writer.recorder as unknown as Encoder).ondataavailable!({ data: new Blob(['sample']) });
  writer.abort(); await Promise.resolve(); await Promise.resolve();
  expect(append).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
