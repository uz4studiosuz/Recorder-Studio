/** Single HTTP byte ranges used by Chromium media seeking. false = unsatisfiable/unsupported. */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null | false {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || !size || (!match[1] && !match[2])) return false;
  if (!match[1]) { const suffix = Number(match[2]); return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : false; }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
  return { start, end: Math.min(end, size - 1) };
}
