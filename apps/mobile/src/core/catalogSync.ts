import { Product } from './cart';

export const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Cursor to send as `productsSince`, or null to ask for the whole catalogue. A full refresh is forced when there is no
 * cursor yet, when the last full refresh is older than 24 hours (a pack unit's factor or barcode can change without the
 * product row changing), or when the stored times are unreadable or in the future.
 */
export function productsSince(cursor: string | null, fullAt: string | null, nowMs: number, maxAgeMs = FULL_REFRESH_MS): string | null {
  if (!cursor || !fullAt) return null;
  const full = Date.parse(fullAt);
  if (Number.isNaN(full) || Number.isNaN(Date.parse(cursor))) return null;
  if (full > nowMs || nowMs - full >= maxAgeMs) return null;
  return cursor;
}

type Delta = Product & { isActive?: boolean };

/** Applies an incremental catalogue answer: changed products replace or join the local ones, inactive ones are removed. */
export function mergeProducts(existing: Product[], delta: Delta[]): Product[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const { isActive, ...p } of delta) {
    if (isActive === false) byId.delete(p.id);
    else byId.set(p.id, p as Product);
  }
  return [...byId.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
