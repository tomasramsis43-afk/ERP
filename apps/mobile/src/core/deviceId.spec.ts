import { KeyValueStore, ensureDeviceId } from './deviceId';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('ensureDeviceId', () => {
  it('creates an id once and reuses it on later starts', async () => {
    const store = memory();
    const first = await ensureDeviceId(store, () => A);
    const second = await ensureDeviceId(store, () => B);
    expect(first).toBe(A);
    expect(second).toBe(A);
  });

  it('gives two installations different ids', async () => {
    const ids = [A, B];
    const one = await ensureDeviceId(memory(), () => ids.shift()!);
    const two = await ensureDeviceId(memory(), () => ids.shift()!);
    expect(one).not.toBe(two);
  });

  it('replaces a corrupted stored value instead of trusting it', async () => {
    const store = memory();
    store.data.set('erp.deviceId', 'device-local');
    expect(await ensureDeviceId(store, () => B)).toBe(B);
    expect(store.data.get('erp.deviceId')).toBe(B);
  });
});
