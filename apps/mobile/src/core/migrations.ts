/** One schema step. `version` numbers are consecutive from 1 and a step is never edited once released. */
export interface Migration {
  version: number;
  sql: string;
}

/** What the runner needs from SQLite; implemented over expo-sqlite in the app and a fake in tests. */
export interface MigrationDb {
  getVersion(): Promise<number>;
  /** Runs the statements and stores the new version atomically. */
  apply(sql: string, version: number): Promise<void>;
}

/** Applies every migration newer than the database's version, in order. Returns the final version. */
export async function migrate(db: MigrationDb, migrations: Migration[]): Promise<number> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migrations must be consecutive from 1 (found ${m.version} at position ${i + 1})`);
  });
  let current = await db.getVersion();
  if (current > sorted.length) throw new Error(`Database version ${current} is newer than this app (${sorted.length}); update the app`);
  for (const m of sorted) {
    if (m.version <= current) continue;
    await db.apply(m.sql, m.version);
    current = m.version;
  }
  return current;
}
