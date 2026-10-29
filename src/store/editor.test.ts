import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditor } from './editor';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  useEditor.getState().setSource(null);
  useEditor.getState().resetAppearance();
});

describe('editor media lifecycle', () => {
  it('clamps seeking to the media duration and rejects non-finite positions', () => {
    useEditor.getState().setSource({ name: 'clip.webm', url: 'blob:one', duration: 12 });
    useEditor.getState().seek(99);
    expect(useEditor.getState().currentTime).toBe(12);
    useEditor.getState().seek(-3);
    expect(useEditor.getState().currentTime).toBe(0);
    useEditor.getState().seek(NaN);
    expect(useEditor.getState().currentTime).toBe(0);
  });
  it('releases old media and resets playback when replacing a clip', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    useEditor.getState().setSource({ name: 'one.webm', url: 'blob:one', duration: 12 });
    useEditor.getState().seek(4);
    useEditor.getState().setPlaying(true);
    useEditor.getState().setSource({ name: 'two.webm', url: 'blob:two', duration: 5 });
    expect(revoke).toHaveBeenCalledWith('blob:one');
    expect(useEditor.getState().playing).toBe(false);
    expect(useEditor.getState().currentTime).toBe(0);
    revoke.mockRestore();
  });
  it('cannot start playback without a clip', () => {
    useEditor.getState().setPlaying(true);
    expect(useEditor.getState().playing).toBe(false);
  });
});
