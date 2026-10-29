import { expect, it } from 'vitest';
import { settings, telemetry } from '../../electron/validation';
import { editSettings } from '../store/editor';
it('rejects project fields that could overwrite store actions', () => {
  const valid = { ...editSettings(), trimEnd: 2 };
  expect(settings(valid)).toBe(valid);
  expect(() => settings({ ...valid, setPlaying: 'invalid' } as never)).toThrow('Unexpected project fields');
  expect(() => settings({ ...valid, speed: NaN })).toThrow();
});
it('requires finite, ordered telemetry timestamps', () => {
  expect(() => telemetry([{ timeMs: 5, x: 0, y: 0, kind: 'move' }, { timeMs: 4, x: 0, y: 0, kind: 'move' }])).toThrow();
  expect(() => telemetry([{ timeMs: 0, x: NaN, y: 0, kind: 'move' }])).toThrow();
});
