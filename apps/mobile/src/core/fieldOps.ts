import { OutboxItem } from './outbox';

/**
 * Pure helpers for the Phase 2 field operations (visits, expenses, new customers, statements, reports).
 * Kept out of the screens so the outbox-derived customer list and the outcome/category labels stay testable.
 */

export interface PendingCustomer {
  opId: string;
  /** Temporary code shown until the server assigns the real one after sync. */
  code: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  address: string | null;
}

/** A new customer that was created offline and is still waiting to be sent. */
export function pendingNewCustomers(ops: OutboxItem[]): PendingCustomer[] {
  const out: PendingCustomer[] = [];
  for (const op of ops) {
    if (op.type !== 'CUSTOMER' || op.status !== 'PENDING') continue;
    const p = op.payload as { nameAr?: unknown; nameEn?: unknown; phone?: unknown; address?: unknown };
    const nameAr = typeof p.nameAr === 'string' ? p.nameAr.trim() : '';
    if (!nameAr) continue;
    out.push({
      opId: op.opId,
      code: `…${op.opId.slice(0, 6)}`,
      nameAr,
      nameEn: typeof p.nameEn === 'string' && p.nameEn.trim() ? p.nameEn.trim() : null,
      phone: typeof p.phone === 'string' && p.phone.trim() ? p.phone.trim() : null,
      address: typeof p.address === 'string' && p.address.trim() ? p.address.trim() : null,
    });
  }
  return out.sort((a, b) => a.nameAr.localeCompare(b.nameAr));
}

/** All customer ids that count as visited today: those the server already has plus those logged offline. */
export function visitedTodayIds(serverVisits: { customerId: string }[], pendingOps: OutboxItem[]): Set<string> {
  const set = new Set(serverVisits.map((v) => v.customerId));
  for (const op of pendingOps) {
    if (op.type !== 'VISIT' || op.status !== 'PENDING') continue;
    const cid = (op.payload as { customerId?: unknown }).customerId;
    if (typeof cid === 'string') set.add(cid);
  }
  return set;
}

export const VISIT_OUTCOMES = ['SALE', 'COLLECTION', 'NO_ORDER', 'SHOP_CLOSED', 'NOT_REACHED'] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'LICENSE', 'INSURANCE', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
