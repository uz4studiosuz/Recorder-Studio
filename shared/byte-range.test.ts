import { expect, it } from 'vitest';
import { byteRange } from './byte-range';
it('serves exact, open-ended and suffix requests without crossing file bounds', () => {
  expect(byteRange(null, 1000)).toBe(null);
  expect(byteRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
  expect(byteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
  expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
  expect(byteRange('bytes=900-9999', 1000)).toEqual({ start: 900, end: 999 });
  expect(byteRange('bytes=-9999', 1000)).toEqual({ start: 0, end: 999 });
});
it('rejects invalid and unsatisfiable requests, including empty files', () => {
  for (const value of ['bytes=1000-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'items=0-1', 'bytes=9007199254740992-']) expect(byteRange(value, 1000)).toBe(false);
  expect(byteRange('bytes=0-', 0)).toBe(false);
});
