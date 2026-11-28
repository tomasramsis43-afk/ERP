import { OutboxItem, ServerResult, applyResults } from '../core/outbox';
import { Snapshot, SyncApi, SyncStore, synchronize } from './syncEngine';

const item = (opId: string, at: string, over: Partial<OutboxItem> = {}): OutboxItem => ({
  opId, type: 'SALE', payload: {}, clientCreatedAt: at, status: 'PENDING', error: null, attempts: 0, ...over,
});

function fakeStore(initial: OutboxItem[]) {
  const state = { outbox: initial, snapshot: null as Snapshot | null };
  const store: SyncStore = {
    loadOutbox: async () => state.outbox,
    applyServerResults: async (r) => { state.outbox = applyResults(state.outbox, r); },
    saveSnapshot: async (s) => { state.snapshot = s; },
  };
  return { state, store };
}

function fakeApi(answer: (ops: { opId: string }[]) => ServerResult[], pullFails = false) {
  const calls = { push: [] as string[][], pull: 0 };
  const api: SyncApi = {
    push: async (_d, ops) => { calls.push.push(ops.map((o) => o.opId)); return answer(ops); },
    pull: async () => { calls.pull += 1; if (pullFails) throw new Error('offline'); return { serverTime: 'now' }; },
  };
  return { api, calls };
}
const applied = (ops: { opId: string }[]): ServerResult[] => ops.map((o) => ({ opId: o.opId, status: 'APPLIED', resultId: 'x' }));

describe('synchronize', () => {
  it('sends oldest first, clears applied operations, then pulls', async () => {
    const { store, state } = fakeStore([item('b', '2026-01-02'), item('a', '2026-01-01')]);
    const { api, calls } = fakeApi(applied);
    const r = await synchronize(api, store, 'dev');
    expect(calls.push).toEqual([['a', 'b']]);
    expect(state.outbox).toEqual([]);
    expect(r).toMatchObject({ sent: 2, applied: 2, pending: 0, pulled: true });
    expect(state.snapshot).not.toBeNull();
  });

  it('keeps everything and skips the pull when the network fails', async () => {
    const { store, state } = fakeStore([item('a', '1')]);
    const api: SyncApi = { push: async () => { throw new Error('no network'); }, pull: async () => { throw new Error('unreachable'); } };
    const r = await synchronize(api, store, 'dev');
    expect(r.error).toBe('no network');
    expect(r.pulled).toBe(false);
    expect(state.outbox).toHaveLength(1);
    expect(state.snapshot).toBeNull();
  });

  it('never pulls while operations are still pending (a pull would erase local sales)', async () => {
    const { store, state } = fakeStore([item('a', '1'), item('b', '2')]);
    const { api, calls } = fakeApi((ops) => ops.map((o) => (o.opId === 'a' ? { opId: 'a', status: 'RETRY' as const, error: 'busy' } : { opId: 'b', status: 'APPLIED' as const, resultId: 'x' })));
    const r = await synchronize(api, store, 'dev');
    expect(calls.pull).toBe(0);
    expect(r.pending).toBe(1);
    expect(state.outbox.map((i) => [i.opId, i.attempts])).toEqual([['a', 1]]);
  });

  it('flags rejected operations with the reason and does not resend them', async () => {
    const { store, state } = fakeStore([item('a', '1')]);
    const { api, calls } = fakeApi((ops) => ops.map((o) => ({ opId: o.opId, status: 'REJECTED' as const, error: 'Insufficient stock' })));
    const r1 = await synchronize(api, store, 'dev');
    expect(r1.rejected).toBe(1);
    expect(state.outbox[0]).toMatchObject({ status: 'REJECTED', error: 'Insufficient stock' });
    const r2 = await synchronize(api, store, 'dev');
    expect(calls.push).toHaveLength(1); // nothing sendable the second time
    expect(r2.sent).toBe(0);
    expect(r2.pulled).toBe(true); // rejected items do not block the refresh
  });

  it('treats DUPLICATE as success (the phone just lost the first answer)', async () => {
    const { store, state } = fakeStore([item('a', '1')]);
    const { api } = fakeApi((ops) => ops.map((o) => ({ opId: o.opId, status: 'DUPLICATE' as const, resultId: 'x' })));
    await synchronize(api, store, 'dev');
    expect(state.outbox).toEqual([]);
  });

  it('splits large queues into batches of 100 and saves after each', async () => {
    const many = Array.from({ length: 250 }, (_, i) => item(`op${String(i).padStart(3, '0')}`, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}`));
    const { store, state } = fakeStore(many);
    const { api, calls } = fakeApi(applied);
    await synchronize(api, store, 'dev');
    expect(calls.push.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(state.outbox).toEqual([]);
  });

  it('a failure in a later batch keeps the answers of earlier batches', async () => {
    const many = Array.from({ length: 150 }, (_, i) => item(`op${i}`, `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`));
    const { store, state } = fakeStore(many);
    let call = 0;
    const api: SyncApi = {
      push: async (_d, ops) => { call += 1; if (call === 2) throw new Error('dropped'); return applied(ops); },
      pull: async () => ({ serverTime: 'x' }),
    };
    const r = await synchronize(api, store, 'dev');
    expect(r.error).toBe('dropped');
    expect(state.outbox).toHaveLength(50);
  });
});


describe('synchronize concurrency', () => {
  it('keeps a sale saved while the push is in flight, and does not pull over it', async () => {
    const { store, state } = fakeStore([item('a', '1')]);
    const api: SyncApi = {
      push: async (_d, ops) => {
        state.outbox = [...state.outbox, item('late', '2')]; // user finishes a sale mid-sync
        return applied(ops);
      },
      pull: async () => { throw new Error('must not pull'); },
    };
    const r = await synchronize(api, store, 'dev');
    expect(state.outbox.map((o) => o.opId)).toEqual(['late']);
    expect(r).toMatchObject({ sent: 1, pending: 1, pulled: false });
  });

  it('a second call while one is running joins it instead of pushing twice', async () => {
    const { store } = fakeStore([item('a', '1')]);
    const { api, calls } = fakeApi(applied);
    const [r1, r2] = await Promise.all([synchronize(api, store, 'dev'), synchronize(api, store, 'dev')]);
    expect(calls.push).toEqual([['a']]);
    expect(r1).toBe(r2);
  });
});
