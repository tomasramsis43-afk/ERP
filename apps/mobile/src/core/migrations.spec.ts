import { Migration, MigrationDb, migrate } from './migrations';

const fake = (start = 0) => {
  const log: number[] = [];
  let version = start;
  const db: MigrationDb = {
    getVersion: async () => version,
    apply: async (_sql, v) => {
      log.push(v);
      version = v;
    },
  };
  return { db, log, get version() { return version; } };
};
const M = (version: number): Migration => ({ version, sql: `-- ${version}` });

describe('migrate', () => {
  it('applies all steps to a new database, in order', async () => {
    const f = fake();
    expect(await migrate(f.db, [M(2), M(1), M(3)])).toBe(3);
    expect(f.log).toEqual([1, 2, 3]);
  });
  it('applies only the steps newer than the stored version', async () => {
    const f = fake(2);
    await migrate(f.db, [M(1), M(2), M(3)]);
    expect(f.log).toEqual([3]);
  });
  it('does nothing when up to date', async () => {
    const f = fake(2);
    await migrate(f.db, [M(1), M(2)]);
    expect(f.log).toEqual([]);
  });
  it('refuses a database newer than the app and non-consecutive lists', async () => {
    await expect(migrate(fake(5).db, [M(1)])).rejects.toThrow('newer than this app');
    await expect(migrate(fake().db, [M(1), M(3)])).rejects.toThrow('consecutive');
  });
  it('stops at the failing step and keeps the last good version', async () => {
    let version = 0;
    const db: MigrationDb = {
      getVersion: async () => version,
      apply: async (_sql, v) => {
        if (v === 2) throw new Error('boom');
        version = v;
      },
    };
    await expect(migrate(db, [M(1), M(2), M(3)])).rejects.toThrow('boom');
    expect(version).toBe(1);
  });
});
