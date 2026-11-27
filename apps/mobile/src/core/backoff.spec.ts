import { backoffMs } from './backoff';

describe('backoffMs', () => {
  it('doubles from 5 seconds', () => {
    expect([1, 2, 3, 4].map((n) => backoffMs(n, () => 0))).toEqual([5_000, 10_000, 20_000, 40_000]);
  });
  it('is capped at 5 minutes plus jitter', () => {
    expect(backoffMs(50, () => 0)).toBe(300_000);
    expect(backoffMs(50, () => 1)).toBe(360_000);
  });
  it('treats attempt 0 like the first attempt', () => {
    expect(backoffMs(0, () => 0)).toBe(5_000);
  });
});
