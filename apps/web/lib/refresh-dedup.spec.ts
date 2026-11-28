import { createRefreshDeduplicator } from './refresh-dedup';

describe('createRefreshDeduplicator', () => {
  it('shares one refresh call across concurrent callers with the same token', async () => {
    const dedup = createRefreshDeduplicator<{ accessToken: string }>();
    let calls = 0;
    const work = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { accessToken: `tok-${calls}` };
    };

    const [a, b, c] = await Promise.all([
      dedup('refresh-1', work),
      dedup('refresh-1', work),
      dedup('refresh-1', work),
    ]);

    expect(calls).toBe(1);
    expect(a).toEqual({ accessToken: 'tok-1' });
    expect(b).toEqual({ accessToken: 'tok-1' });
    expect(c).toEqual({ accessToken: 'tok-1' });
  });

  it('allows a fresh refresh once the inflight one settles and isolates different tokens', async () => {
    const dedup = createRefreshDeduplicator<string>();
    let n = 0;
    const [r1, r2] = await Promise.all([
      dedup('t1', async () => `v${++n}`),
      dedup('t2', async () => `v${++n}`),
    ]);
    const r3 = await dedup('t1', async () => `v${++n}`);
    expect([r1, r2, r3]).toEqual(['v1', 'v2', 'v3']);
  });
});
