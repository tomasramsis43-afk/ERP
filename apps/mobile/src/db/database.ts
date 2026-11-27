import * as SQLite from 'expo-sqlite';
import { CustomerPrice, Product } from '../core/cart';
import { OutboxItem } from '../core/outbox';
import { Receipt, pruneReceipts } from '../core/receipts';
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

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('erp-field.db');
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        opId TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, clientCreatedAt TEXT NOT NULL,
        status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (
        opId TEXT PRIMARY KEY, date TEXT NOT NULL, createdAt TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipts_date ON receipts (date);
    `);
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

export const store: SyncStore = {
  async loadOutbox() {
    const d = await db();
    return (await d.getAllAsync<Record<string, unknown>>('SELECT * FROM outbox ORDER BY clientCreatedAt')).map(rowToItem);
  },
  /** Replaces the queue atomically: either the whole new state is stored or none of it. */
  async saveOutbox(items) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      await d.runAsync('DELETE FROM outbox');
      for (const i of items) {
        await d.runAsync(
          'INSERT INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
          [i.opId, i.type, JSON.stringify(i.payload), i.clientCreatedAt, i.status, i.error, i.attempts],
        );
      }
    });
  },
  async saveSnapshot(s: Snapshot) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      for (const key of ['representative', 'customers', 'customerPrices', 'products', 'vanStock', 'serverTime']) {
        await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', [key, JSON.stringify(s[key] ?? null)]);
      }
    });
  },
};

/** Adds one operation; the same transaction-safe INSERT means an operation is stored exactly once. */
export async function enqueue(item: OutboxItem): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT OR IGNORE INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
    [item.opId, item.type, JSON.stringify(item.payload), item.clientCreatedAt, item.status, item.error, item.attempts],
  );
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
