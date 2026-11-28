import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
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
    await d.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await migrate(d);
    return d;
  })();
  return dbPromise;
}

/**
 * Ordered, append-only schema steps. `PRAGMA user_version` records how many have run, so a step never
 * runs twice and an app update only applies the steps the installed database is missing.
 * Never edit a released step; add a new one.
 */
const MIGRATIONS: string[] = [
  `
      CREATE TABLE IF NOT EXISTS outbox (
        opId TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, clientCreatedAt TEXT NOT NULL,
        status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (
        opId TEXT PRIMARY KEY, date TEXT NOT NULL, createdAt TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipts_date ON receipts (date);
  `,
  `CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, clientCreatedAt);`,
];

export async function migrate(d: SQLite.SQLiteDatabase): Promise<void> {
  const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await d.withTransactionAsync(async () => {
      await d.execAsync(MIGRATIONS[v]);
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

const DEVICE_KEY = 'erp.deviceId';
let deviceIdCache: string | null = null;

/** One random id per installation, created once and kept in SecureStore. It labels sync metadata and audit logs; it is never a credential. */
export async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  let id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  }
  deviceIdCache = id;
  return id;
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

/**
 * Saves one financial operation as a single unit: the outbox entry, its receipt and (when stock moved)
 * the van stock. If any write fails, none of them is kept, so a crash can never leave an operation
 * queued without its receipt or without the stock change that goes with it.
 */
export async function saveOperation(item: OutboxItem, receipt: Receipt, vanStock?: Map<string, string>): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      'INSERT OR IGNORE INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
      [item.opId, item.type, JSON.stringify(item.payload), item.clientCreatedAt, item.status, item.error, item.attempts],
    );
    await d.runAsync('INSERT OR IGNORE INTO receipts (opId, date, createdAt, body) VALUES (?,?,?,?)', [receipt.opId, receipt.date, receipt.createdAt, JSON.stringify(receipt)]);
    if (vanStock) {
      const rows = [...vanStock.entries()].map(([productId, quantity]) => ({ productId, quantity }));
      await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', ['vanStock', JSON.stringify(rows)]);
    }
  });
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
