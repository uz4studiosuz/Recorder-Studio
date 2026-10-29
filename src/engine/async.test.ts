import { expect, it } from 'vitest';
import { withTimeout } from '../../shared/async';
it('returns a completed operation and rejects stalled operations', async () => {
  await expect(withTimeout(Promise.resolve(7), 50, 'stalled')).resolves.toBe(7);
  await expect(withTimeout(new Promise<never>(() => {}), 5, 'stalled')).rejects.toThrow('stalled');
});
