import { afterEach, expect, it, vi } from 'vitest';
import { deviceError, prepareCapture } from './capture';
afterEach(() => vi.unstubAllGlobals());
it('reports missing inputs individually and still prepares screen-only capture', async () => {
  vi.stubGlobal('window', { recorder: { armLoopback: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Requested device not found', 'NotFoundError')) } });
  const prepared = await prepareCapture({ microphone: true, webcam: true, systemAudio: false }, vi.fn());
  expect(prepared.warnings).toHaveLength(2);
  expect(prepared.warnings.join(' ')).toContain('Microphone: device not found');
  expect(prepared.warnings.join(' ')).toContain('Webcam: device not found');
  expect(prepared.active).toEqual([]);
  const session = await prepared.start(); await session.stop(); prepared.dispose();
});
it('distinguishes permission denial from a busy or disconnected input', () => {
  expect(deviceError('Camera', new DOMException('', 'NotAllowedError'))).toContain('access denied');
  expect(deviceError('Microphone', new DOMException('', 'NotReadableError'))).toContain('busy');
  expect(deviceError('Camera', new DOMException('', 'OverconstrainedError'))).toContain('Refresh');
});
it('reuses a live preview camera without opening the same device twice', async () => {
  const getUserMedia = vi.fn(), originalStop = vi.fn(), clonedStop = vi.fn();
  const clone = { getTracks: () => [{ stop: clonedStop }] } as unknown as MediaStream;
  const preview = { getVideoTracks: () => [{ readyState: 'live', stop: originalStop }], clone: () => clone } as unknown as MediaStream;
  vi.stubGlobal('window', { recorder: { armLoopback: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const prepared = await prepareCapture({ microphone: false, webcam: true, systemAudio: false }, vi.fn(), { webcam: preview });
  expect(prepared.active).toContain('Webcam'); expect(getUserMedia).not.toHaveBeenCalled();
  prepared.dispose(); expect(clonedStop).toHaveBeenCalled(); expect(originalStop).not.toHaveBeenCalled();
});
