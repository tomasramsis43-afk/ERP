import { format, parseScaled, Scaled } from './money';

/**
 * Pure helpers behind the "Today" dashboard. They are kept out of the screen so the route order, the
 * money totals and the customer status chips can be unit-tested without React Native.
 */

export interface CustomerLike {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  phone?: string | null;
  address?: string | null;
  balance: string;
  creditLimit: string;
  routeSequence?: number | null;
}

export interface VisitLike {
  customerId: string;
  outcome: string;
}

export type CustomerStatus = 'PAID' | 'DUE' | 'OVER_LIMIT';

/** Never throws: a malformed amount from an older snapshot is shown as zero instead of crashing a screen. */
export function safeScaled(value: string | null | undefined): Scaled {
  try {
    return parseScaled((value ?? '').trim() || '0', 2);
  } catch {
    return 0n;
  }
}

/** Adds decimal strings exactly (BigInt, no floating point) and returns a 2-decimal string. */
export function addMoney(...values: (string | null | undefined)[]): string {
  return format(values.reduce<Scaled>((sum, v) => sum + safeScaled(v), 0n), 2);
}

/** "12450.00" → "12,450.00". Keeps the sign and the decimals untouched. */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return value;
  const grouped = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${m[1]}${grouped}${m[3] ? `.${m[3]}` : ''}`;
}

/** Dashboard money: grouped and with a trailing ".00" removed, so cards stay short. */
export function displayMoney(value: string | null | undefined): string {
  const fixed = format(safeScaled(value), 2);
  return groupDigits(fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed);
}

/** True when the customer owes more than the credit limit allows (a limit of zero means "no credit"). */
export function isOverLimit(customer: Pick<CustomerLike, 'balance' | 'creditLimit'>): boolean {
  const limit = safeScaled(customer.creditLimit);
  return limit > 0n && safeScaled(customer.balance) > limit;
}

export function customerStatus(customer: Pick<CustomerLike, 'balance' | 'creditLimit'>): CustomerStatus {
  if (safeScaled(customer.balance) <= 0n) return 'PAID';
  return isOverLimit(customer) ? 'OVER_LIMIT' : 'DUE';
}

const byRoute = <T extends CustomerLike>(a: T, b: T): number => {
  const ra = a.routeSequence ?? Number.MAX_SAFE_INTEGER;
  const rb = b.routeSequence ?? Number.MAX_SAFE_INTEGER;
  return ra === rb ? a.code.localeCompare(b.code) : ra - rb;
};

export interface RouteSplit<T extends CustomerLike> {
  /** Customers still to visit today, in route order. */
  pending: T[];
  /** Customers already visited today, in route order. */
  visited: T[];
  total: number;
  visitedCount: number;
  /** 0..100, rounded. */
  percent: number;
}

/**
 * Splits the day's customers using the visit log the server sends with the snapshot. A customer appears in
 * `visited` once any outcome was logged for today, whatever the outcome was.
 */
export function splitRoute<T extends CustomerLike>(customers: T[], visits: VisitLike[]): RouteSplit<T> {
  const seen = new Set(visits.map((v) => v.customerId));
  const pending: T[] = [];
  const visited: T[] = [];
  for (const c of customers) (seen.has(c.id) ? visited : pending).push(c);
  pending.sort(byRoute);
  visited.sort(byRoute);
  const total = customers.length;
  const visitedCount = visited.length;
  return {
    pending,
    visited,
    total,
    visitedCount,
    percent: total === 0 ? 0 : Math.round((visitedCount / total) * 100),
  };
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Top N customers by outstanding balance, descending. Customers with zero/negative balance are excluded. */
export function topCustomersByBalance<T extends { balance: string; id: string }>(customers: T[], limit = 3): T[] {
  return [...customers]
    .filter((c) => safeScaled(c.balance) > 0n)
    .sort((a, b) => (safeScaled(b.balance) > safeScaled(a.balance) ? 1 : safeScaled(b.balance) < safeScaled(a.balance) ? -1 : 0))
    .slice(0, limit);
}

/** Sums sales (cash + credit) for receipts whose date starts with the given month (yyyy-mm). */
export function monthSalesTotal(receipts: { kind: string; total: string; date: string }[], month: string): string {
  let sum = 0n;
  for (const r of receipts) {
    if (!r.date.startsWith(month)) continue;
    if (r.kind !== 'CASH_SALE' && r.kind !== 'CREDIT_SALE') continue;
    sum += safeScaled(r.total);
  }
  return format(sum, 2);
}

/** Local calendar day as yyyy-mm-dd, matching the date the receipts and the close-day preview use. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Long, human date for the dashboard header; falls back to the ISO date when Intl is unavailable. */
export function longDate(now: Date, lang: 'ar' | 'en'): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
  } catch {
    return todayISO(now);
  }
}
