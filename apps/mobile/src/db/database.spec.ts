const secure = new Map<string, string>();
let uuidCounter = 0;
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++uuidCounter}` }));
jest.mock('expo-sqlite', () => ({}));

import { getDeviceId, migrate } from './database';

/** Minimal stand-in for the SQLite handle: records executed SQL and tracks user_version. */
function fakeDb(startVersion: number) {
  const executed: string[] = [];
  let version = startVersion;
  return {
    executed,
    get version() { return version; },
    getFirstAsync: async () => ({ user_version: version }),
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    execAsync: async (sql: string) => {
      const m = /PRAGMA user_version = (\d+)/.exec(sql);
      if (m) version = Number(m[1]);
      else executed.push(sql);
    },
  };
}

describe('mobile schema versioning', () => {
  it('applies every step to a new database and records the version', async () => {
    const d = fakeDb(0);
    await migrate(d as never);
    expect(d.version).toBeGreaterThanOrEqual(2);
    expect(d.executed.join('\n')).toContain('CREATE TABLE IF NOT EXISTS outbox');
  });

  it('does not rerun steps already applied', async () => {
    const d = fakeDb(0);
    await migrate(d as never);
    const done = d.executed.length;
    await migrate(d as never);
    expect(d.executed.length).toBe(done);
  });

  it('only applies the missing steps to an older install', async () => {
    const d = fakeDb(1);
    await migrate(d as never);
    expect(d.executed.join('\n')).not.toContain('CREATE TABLE IF NOT EXISTS outbox');
    expect(d.executed.join('\n')).toContain('outbox_status');
  });
});

describe('device identity', () => {
  it('creates one UUID, keeps it, and reuses it', async () => {
    const first = await getDeviceId();
    expect(first).toMatch(/^uuid-/);
    expect(secure.get('erp.deviceId')).toBe(first);
    expect(await getDeviceId()).toBe(first);
    expect(uuidCounter).toBe(1);
  });
});
