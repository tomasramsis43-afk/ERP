import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { ensureDeviceId } from '../core/deviceId';
import { mergeProducts, productsSince } from '../core/catalogSync';
import { Migration, migrate } from '../core/migrations';
import { createSerialQueue } from '../core/serial';
import { CustomerPrice, Product } from '../core/cart';
import { OutboxItem, ServerResult } from '../core/outbox';
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

/** Released schema steps. Never edit a released step; add a new one. Step 1 equals the original schema, so existing installs upgrade in place. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
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
  },
  {
    version: 2,
    sql: `CREATE INDEX IF NOT EXISTS outbox_status_created ON outbox (status, clientCreatedAt);`,
  },
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Every write goes through this queue. expo-sqlite's withTransactionAsync does not isolate statements that other code
 * runs on the same connection in the meantime, so two writers could otherwise land in each other's transaction.
 */
const write = createSerialQueue();

export function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('erp-field.db');
    await d.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await migrate(
      {
        getVersion: async () => (await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0,
        // Statements and the new version are stored in one transaction: a crash leaves the previous version intact.
        apply: (sql, version) =>
          d.withTransactionAsync(async () => {
            await d.execAsync(sql);
            await d.execAsync(`PRAGMA user_version = ${Math.trunc(version)}`);
          }),
      },
      MIGRATIONS,
    );
    return d;
  })();
  return dbPromise;
}

/** Reports whether SQLite considers the file healthy. It never deletes or repairs anything; unsent operations stay put. */
export async function databaseIsHealthy(): Promise<boolean> {
  const d = await db();
  const rows = await d.getAllAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  return rows.length === 1 && rows[0].integrity_check === 'ok';
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
  async productsSince() {
    const d = await db();
    const get = async (key: string) => (await d.getFirstAsync<{ value: string }>('SELECT value FROM snapshot WHERE key = ?', [key]))?.value ?? null;
    const [cursor, fullAt, products] = await Promise.all([get('productsCursor'), get('productsFullAt'), get('products')]);
    const parse = <T,>(v: string | null): T | null => {
      try { return v ? (JSON.parse(v) as T) : null; } catch { return null; }
    };
    // No stored catalogue (or an empty/unreadable one): a delta would be merged into nothing, so ask for everything.
    const catalogue = parse<unknown[]>(products);
    if (!Array.isArray(catalogue) || catalogue.length === 0) return null;
    const unwrap = (v: string | null) => parse<string>(v);
    return productsSince(unwrap(cursor), unwrap(fullAt), Date.now());
  },
  /** Updates only the answered operations; rows added meanwhile (a sale saved during the sync) are untouched. */
  applyResults(results: ServerResult[]) {
    return write(async () => {
      const d = await db();
      await d.withTransactionAsync(async () => {
        for (const r of results) {
          if (r.status === 'APPLIED' || r.status === 'DUPLICATE') await d.runAsync('DELETE FROM outbox WHERE opId = ?', [r.opId]);
          else if (r.status === 'REJECTED') await d.runAsync("UPDATE outbox SET status = 'REJECTED', error = ?, attempts = attempts + 1 WHERE opId = ?", [r.error, r.opId]);
          else await d.runAsync('UPDATE outbox SET attempts = attempts + 1 WHERE opId = ?', [r.opId]);
        }
      });
    });
  },
  /** Stored only when nothing is waiting to be sent; the check and the write share one transaction. */
  saveSnapshot(s: Snapshot) {
    return write(async () => {
      const d = await db();
      let stored = false;
      await d.withTransactionAsync(async () => {
        const waiting = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'");
        if ((waiting?.n ?? 0) > 0) return;
        const put = (key: string, value: unknown) => d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', [key, JSON.stringify(value ?? null)]);
        for (const key of ['representative', 'customers', 'customerPrices', 'vanStock', 'serverTime']) await put(key, s[key]);
        if (s.productsMode === 'DELTA') {
          const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM snapshot WHERE key = 'products'");
          const current = row ? (JSON.parse(row.value) as Product[] | null) ?? [] : [];
          await put('products', mergeProducts(current, (s.products as Product[] | undefined) ?? []));
        } else {
          await put('products', s.products);
          await put('productsFullAt', s.serverTime); // a full catalogue restarts the 24-hour clock
        }
        await put('productsCursor', s.serverTime); // taken by the server before it read, so nothing in between is skipped
        stored = true;
      });
      return stored;
    });
  },
};

/** Removes one operation the server rejected, after the user chose to discard it. Pending operations are never removed. */
export function discardRejected(opId: string): Promise<void> {
  return write(async () => {
    const d = await db();
    await d.runAsync("DELETE FROM outbox WHERE opId = ? AND status = 'REJECTED'", [opId]);
  });
}

/** This installation's identity (random UUID, created once, kept across restarts). */
export const getDeviceId = (): Promise<string> =>
  ensureDeviceId({ get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v) }, () => Crypto.randomUUID());

/**
 * Saves a financial operation as ONE atomic unit: the outbox entry, its receipt and (when stock moved) the local
 * van stock. If any part fails the whole transaction rolls back, so the phone never holds an operation without its
 * receipt or a stock change without its operation. The same opId is stored once.
 */
export function saveOperation(item: OutboxItem, receipt: Receipt, vanStock?: Map<string, string>): Promise<void> {
  return write(async () => {
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
  });
}

/** Adds one operation; the same transaction-safe INSERT means an operation is stored exactly once. */
export function enqueue(item: OutboxItem): Promise<void> {
  return write(async () => {
    const d = await db();
    await d.runAsync(
      'INSERT OR IGNORE INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
      [item.opId, item.type, JSON.stringify(item.payload), item.clientCreatedAt, item.status, item.error, item.attempts],
    );
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
  setVanStock(stock: Map<string, string>): Promise<void> {
    return write(async () => {
      const d = await db();
      const rows = [...stock.entries()].map(([productId, quantity]) => ({ productId, quantity }));
      await d.runAsync('INSERT OR REPLACE INTO snapshot (key, value) VALUES (?, ?)', ['vanStock', JSON.stringify(rows)]);
    });
  },
};

/** Keeps a permanent local record of an operation (receipt + day summary). Same opId is stored once. */
export function addReceipt(r: Receipt): Promise<void> {
  return write(async () => {
    const d = await db();
    await d.runAsync('INSERT OR IGNORE INTO receipts (opId, date, createdAt, body) VALUES (?,?,?,?)', [r.opId, r.date, r.createdAt, JSON.stringify(r)]);
  });
}

/** Logs a visit: the operation for the server and today's visited list, in one atomic write. */
export function saveVisit(item: OutboxItem, date: string, customerId: string): Promise<void> {
  return write(async () => {
    const d = await db();
    await d.withTransactionAsync(async () => {
      await d.runAsync(
        'INSERT OR IGNORE INTO outbox (opId, type, payload, clientCreatedAt, status, error, attempts) VALUES (?,?,?,?,?,?,?)',
        [item.opId, item.type, JSON.stringify(item.payload), item.clientCreatedAt, item.status, item.error, item.attempts],
      );
      const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM snapshot WHERE key = 'visits'");
      const cur = row ? (JSON.parse(row.value) as { date: string; ids: string[] }) : { date, ids: [] };
      const ids = cur.date === date ? cur.ids : [];
      if (!ids.includes(customerId)) ids.push(customerId);
      await d.runAsync("INSERT OR REPLACE INTO snapshot (key, value) VALUES ('visits', ?)", [JSON.stringify({ date, ids })]);
    });
  });
}

/** Customers with a logged visit today. */
export async function visitsForDate(date: string): Promise<string[]> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM snapshot WHERE key = 'visits'");
  const cur = row ? (JSON.parse(row.value) as { date: string; ids: string[] }) : null;
  return cur && cur.date === date ? cur.ids : [];
}

/** Receipts from `date` on (the table keeps 30 days). */
export async function receiptsSince(date: string): Promise<Receipt[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ body: string }>('SELECT body FROM receipts WHERE date >= ? ORDER BY createdAt DESC', [date]);
  return rows.map((x) => JSON.parse(x.body) as Receipt);
}

export async function receiptsForDate(date: string): Promise<Receipt[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ body: string }>('SELECT body FROM receipts WHERE date = ? ORDER BY createdAt', [date]);
  return rows.map((x) => JSON.parse(x.body) as Receipt);
}

export function pruneOldReceipts(today: string, keepDays = 30): Promise<void> {
  return write(async () => {
    const d = await db();
    const all = await d.getAllAsync<{ opId: string; date: string }>('SELECT opId, date FROM receipts');
    const keep = new Set(pruneReceipts(all.map((x) => ({ opId: x.opId, date: x.date }) as Receipt), today, keepDays).map((x) => x.opId));
    await d.withTransactionAsync(async () => {
      for (const row of all) if (!keep.has(row.opId)) await d.runAsync('DELETE FROM receipts WHERE opId = ?', [row.opId]);
    });
  });
}
