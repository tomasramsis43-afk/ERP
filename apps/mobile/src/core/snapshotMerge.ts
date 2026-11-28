export interface Snapshot {
  serverTime: string;
  mode?: 'FULL' | 'DELTA';
  [key: string]: unknown;
}

type Row = { id: string; code?: string; [key: string]: unknown };

/** The local copy cannot take this delta (nothing stored yet, or rows it refers to are missing): ask for a full snapshot. */
export class SnapshotMismatchError extends Error {
  constructor(reason: string) {
    super(`Snapshot mismatch: ${reason}`);
  }
}

const byCode = (a: Row, b: Row) => String(a.code ?? '').localeCompare(String(b.code ?? ''));

/**
 * Turns what the server sent plus what the phone already holds into the new local snapshot.
 * A FULL (or untagged, from an older server) answer replaces everything. A DELTA is merged by id:
 * changed rows replace old ones, removed products and customers that left the route disappear, and every balance is refreshed.
 */
export function mergeSnapshot(prev: Record<string, unknown>, s: Snapshot): Record<string, unknown> {
  if (s.mode !== 'DELTA') {
    return {
      representative: s.representative ?? null,
      customers: s.customers ?? null,
      customerPrices: s.customerPrices ?? null,
      products: s.products ?? null,
      vanStock: s.vanStock ?? null,
      serverTime: s.serverTime,
    };
  }
  const prevProducts = prev.products as Row[] | null | undefined;
  const prevCustomers = prev.customers as Row[] | null | undefined;
  if (!prevProducts || !prevCustomers) throw new SnapshotMismatchError('no local data to apply a delta to');

  const removed = new Set((s.removedProductIds as string[]) ?? []);
  const products = new Map(prevProducts.filter((p) => !removed.has(p.id)).map((p) => [p.id, p]));
  for (const p of (s.products as Row[]) ?? []) products.set(p.id, p);

  const ids = new Set((s.customerIds as string[]) ?? []);
  const customers = new Map(prevCustomers.filter((c) => ids.has(c.id)).map((c) => [c.id, c]));
  for (const c of (s.customers as Row[]) ?? []) customers.set(c.id, c);
  for (const id of ids) if (!customers.has(id)) throw new SnapshotMismatchError(`customer ${id} is unknown locally`);
  const balances = new Map(((s.customerBalances as { id: string; balance: string }[]) ?? []).map((b) => [b.id, b.balance]));

  return {
    representative: s.representative ?? prev.representative ?? null,
    customers: [...customers.values()].map((c) => ({ ...c, balance: balances.get(c.id) ?? c.balance ?? '0.00' })).sort(byCode),
    customerPrices: s.customerPrices ?? [],
    products: [...products.values()].sort(byCode),
    vanStock: s.vanStock ?? [],
    serverTime: s.serverTime,
  };
}
