import * as SQLite from 'expo-sqlite';
import { CustomerPrice, Product } from '../core/cart';
import * as Crypto from 'expo-crypto';
import { OutboxItem, ServerResult } from '../core/outbox';
import { Receipt, pruneReceipts } from '../core/receipts';
import { mergeSnapshot } from '../core/snapshotMerge';
import { Snapshot, SyncStore } from '../sync/syncEngine';

export interface Customer {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
  creditLimit: string;
  balance: string;
}

export interface RepProfile {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  vanWarehouseId: string | null;
  custodyBalance: string;
}

/** Ordered, append-only. Each entry runs once, inside a transaction; PRAGMA user_version records how many ran. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS outbox (
     opId TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, clientCreatedAt TEXT NOT NULL,
     status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS receipts (
     opId TEXT PRIMARY KEY, date TEXT NOT NULL, createdAt TEXT NOT NULL, body TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS receipts_date ON receipts (date);`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

async function migrate(d: SQLite.SQLiteDatabase): Promise<void> {
  const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await d.withTransactionAsync(async () => {
      await d.execAsync(MIGRATIONS[v]);
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('erp-field.db');
    await d.execAsync('PRAGMA journal_mode = WAL;');
    await migrate(d);
    return d;
  })();
  return dbPromise;
}

const rowToItem = (r: Record<string, unknown>): OutboxItem => ({
  opId: r.opId as string,
  type: r.type as OutboxItem['type'],
  payload: JSON.parse(r.payload as string),
  clientCreatedAt: r.clientCreatedAt as string,
  status: r.status as OutboxItem['status'],
  error: (r.error as string | null) ?? null,
  attempts: r.attempts as number,
});

const SNAPSHOT_KEYS = ['representative', 'customers', 'customerPrices', 'products', 'vanStock', 'serverTime'];

export const store: SyncStore = {
  async loadOutbox() {
    const d = await db();
    return (await d.getAllAsync<Record<string, unknown>>('SELECT * FROM outbox ORDER BY clientCreatedAt')).map(rowToItem);
  },
  async applyServerResults(results: ServerResult[]) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      for (const r of results) {
        if (r.status === 'APPLIED' || r.status === 'DUPLICATE') {
          await d.runAsync('DELETE FROM outbox WHERE opId = ?', [r.opId]);
        } else if (r.status === 'REJECTED') {
          await d.runAsync("UPDATE outbox SET status = 'REJECTED', error = ?, attempts = attempts + 1 WHERE opId = ?", [r.error, r.opId]);
        } else {
          await d.runAsync('UPDATE outbox SET attempts = attempts + 1 WHERE opId = ?', [r.opId]);
        }
      }
    });
  },
  async lastSyncTime() {
    return read<string | null>('serverTime', null);
  },
  async saveSnapshot(s: Snapshot) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      const prev: Record<string, unknown> = {};
      for (const key of SNAPSHOT_KEYS) prev[key] = await read<unknown>(key, null);
      const next = mergeSnapshot(prev, s); // throws SnapshotMismatchError before anything is written
      for (const key of SNAPSHOT_KEYS) await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', [key, JSON.stringify(next[key] ?? null)]);
    });
  },
};

/**
 * Saves a finished operation as ONE unit: the outbox entry, its receipt and (when stock moved) the van stock.
 * If the app dies half-way, SQLite rolls all of it back, so there is never an operation without its receipt
 * or a sale that did not reduce the van stock. The same opId is stored once.
 */
export async function commitLocal(op: { item: OutboxItem; receipt: Receipt; vanStock?: Map<string, string> }): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    const { item, receipt } = op;
    await d.runAsync(
      'INSERT OR IGNORE INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
      [item.opId, item.type, JSON.stringify(item.payload), item.clientCreatedAt, item.status, item.error, item.attempts],
    );
    await d.runAsync('INSERT OR IGNORE INTO receipts (opId, date, createdAt, body) VALUES (?,?,?,?)', [receipt.opId, receipt.date, receipt.createdAt, JSON.stringify(receipt)]);
    if (op.vanStock) {
      const rows = [...op.vanStock.entries()].map(([productId, quantity]) => ({ productId, quantity }));
      await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', ['vanStock', JSON.stringify(rows)]);
    }
  });
}

/** Removes one rejected operation the user has reviewed. Touches only that row. */
export async function discardOperation(opId: string): Promise<void> {
  const d = await db();
  await d.runAsync("DELETE FROM outbox WHERE opId = ? AND status = 'REJECTED'", [opId]);
}

/** A random id created once per installation and kept for good. It labels sync metadata and audit logs; it is not a credential. */
export async function getDeviceId(): Promise<string> {
  const d = await db();
  await d.runAsync("INSERT OR IGNORE INTO meta (key, value) VALUES ('deviceId', ?)", [Crypto.randomUUID()]);
  const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'deviceId'");
  return row!.value;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM snapshot WHERE key = ?', [key]);
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export const local = {
  customers: () => read<Customer[]>('customers', []),
  products: () => read<Product[]>('products', []),
  prices: () => read<CustomerPrice[]>('customerPrices', []),
  rep: () => read<RepProfile | null>('representative', null),
  lastSync: () => read<string | null>('serverTime', null),
  async vanStock(): Promise<Map<string, string>> {
    const rows = await read<{ productId: string; quantity: string }[]>('vanStock', []);
    return new Map(rows.map((r) => [r.productId, r.quantity]));
  },
  async setVanStock(stock: Map<string, string>): Promise<void> {
    const d = await db();
    const rows = [...stock.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', ['vanStock', JSON.stringify(rows)]);
  },
};

/** Keeps a permanent local record of an operation (receipt + day summary). Same opId is stored once. */
export async function addReceipt(r: Receipt): Promise<void> {
  const d = await db();
  await d.runAsync('INSERT OR IGNORE INTO receipts (opId, date, createdAt, body) VALUES (?,?,?,?)', [r.opId, r.date, r.createdAt, JSON.stringify(r)]);
}

export async function receiptsForDate(date: string): Promise<Receipt[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ body: string }>('SELECT body FROM receipts WHERE date = ? ORDER BY createdAt', [date]);
  return rows.map((x) => JSON.parse(x.body) as Receipt);
}

export async function pruneOldReceipts(today: string, keepDays = 30): Promise<void> {
  const d = await db();
  const all = await d.getAllAsync<{ opId: string; date: string }>('SELECT opId, date FROM receipts');
  const keep = new Set(pruneReceipts(all.map((x) => ({ opId: x.opId, date: x.date }) as Receipt), today, keepDays).map((x) => x.opId));
  for (const row of all) if (!keep.has(row.opId)) await d.runAsync('DELETE FROM receipts WHERE opId = ?', [row.opId]);
}
