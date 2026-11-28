import { format, parseScaled } from './money';
import { Receipt } from './receipts';

export interface CustomerLike {
  id: string;
  balance: string;
  creditLimit: string;
}

export type CustomerStatus = 'OVER_LIMIT' | 'DUE' | 'CLEAR';

const zero = (v: string): bigint => {
  try { return parseScaled(v, 2); } catch { return 0n; }
};

/** OVER_LIMIT only when a limit is set (0 means none) and the balance is above it; DUE = owes something. */
export function customerStatus(c: CustomerLike): CustomerStatus {
  const bal = zero(c.balance);
  const limit = zero(c.creditLimit);
  if (limit > 0n && bal > limit) return 'OVER_LIMIT';
  return bal > 0n ? 'DUE' : 'CLEAR';
}

export type CreditCheck = 'OK' | 'NEAR' | 'OVER' | 'NO_LIMIT';

/**
 * What a new credit sale does to the customer's limit. The server stays the authority; this only warns the
 * representative before saving. NEAR = at or above 90% of the limit after the sale.
 */
export function creditCheck(balance: string, creditLimit: string, saleTotal: string): CreditCheck {
  const limit = zero(creditLimit);
  if (limit <= 0n) return 'NO_LIMIT';
  const after = zero(balance) + zero(saleTotal);
  if (after > limit) return 'OVER';
  return after * 10n >= limit * 9n ? 'NEAR' : 'OK';
}

export interface TodayStats {
  sales: string;
  collections: string;
  returns: string;
  expenses: string;
  operations: number;
}

export function todayStats(receipts: Receipt[], date: string): TodayStats {
  let sales = 0n, coll = 0n, ret = 0n, exp = 0n, ops = 0;
  for (const r of receipts) {
    if (r.date !== date) continue;
    ops += 1;
    const v = zero(r.total);
    if (r.kind === 'CASH_SALE' || r.kind === 'CREDIT_SALE') sales += v;
    else if (r.kind === 'COLLECTION') coll += v;
    else if (r.kind === 'EXPENSE') exp += v;
    else ret += v;
  }
  return { sales: format(sales, 2), collections: format(coll, 2), returns: format(ret, 2), expenses: format(exp, 2), operations: ops };
}

/** Customers already handled today: any sale, collection or return receipt, or a logged visit. */
export function visitedToday(receipts: Receipt[], date: string, visitIds: string[]): Set<string> {
  const ids = new Set(visitIds);
  for (const r of receipts) if (r.date === date && r.customerId) ids.add(r.customerId);
  return ids;
}

/** Who to see next: not yet visited today, those who owe most first. */
export function nextVisits<T extends CustomerLike>(customers: T[], visited: Set<string>, limit = 5): T[] {
  return customers
    .filter((c) => !visited.has(c.id))
    .sort((a, b) => (zero(b.balance) > zero(a.balance) ? 1 : zero(b.balance) < zero(a.balance) ? -1 : 0))
    .slice(0, limit);
}

/** Van stock at or below this many base units is shown as running out. */
export const LOW_STOCK = 5;

export function isLowStock(quantity: string | undefined): boolean {
  if (quantity === undefined) return true;
  try { return parseScaled(quantity, 4) <= BigInt(LOW_STOCK) * 10_000n; } catch { return false; }
}
