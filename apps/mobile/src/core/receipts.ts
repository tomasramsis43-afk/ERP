import { Scaled, format, parseScaled } from './money';

export type ReceiptKind = 'CASH_SALE' | 'CREDIT_SALE' | 'RETURN_GOOD' | 'RETURN_DAMAGED' | 'COLLECTION' | 'EXPENSE';

export interface ReceiptLine {
  name: string;
  quantity: string;
  unitPrice?: string;
  /** Estimated line total (2 decimals). The server is the authority on the final figure. */
  amount?: string;
}

/**
 * A permanent local record of something the representative did. The outbox is emptied as operations sync, so
 * receipts (and the day summary built from them) live in their own table, keyed by the same opId.
 */
export interface Receipt {
  opId: string;
  kind: ReceiptKind;
  /** yyyy-mm-dd, device date at creation. */
  date: string;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  lines: ReceiptLine[];
  /** Estimated total, 2 decimals. */
  total: string;
  /** Returns only: true = refunded in cash from the custody, false = credited to the customer's account. */
  cashRefund?: boolean;
}

export interface DaySummary {
  date: string;
  count: number;
  cashSales: string;
  creditSales: string;
  collections: string;
  returnsGood: string;
  returnsDamaged: string;
  cashRefunds: string;
  /** Paid from the custody (fuel, maintenance...). */
  expenses: string;
  /** Cash that should be in the representative's hands from today's documents (estimate). */
  expectedCash: string;
}

const money = (v: string): Scaled => parseScaled(v, 2);

/** Sums one day's receipts. Expected cash = cash sales + collections - cash refunds - expenses. */
export function summarizeDay(receipts: Receipt[], date: string): DaySummary {
  let cash = 0n, credit = 0n, coll = 0n, good = 0n, damaged = 0n, refunds = 0n, spent = 0n, count = 0;
  for (const r of receipts) {
    if (r.date !== date) continue;
    count += 1;
    const total = money(r.total);
    switch (r.kind) {
      case 'CASH_SALE': cash += total; break;
      case 'CREDIT_SALE': credit += total; break;
      case 'COLLECTION': coll += total; break;
      case 'EXPENSE': spent += total; break;
      case 'RETURN_GOOD': good += total; if (r.cashRefund) refunds += total; break;
      case 'RETURN_DAMAGED': damaged += total; if (r.cashRefund) refunds += total; break;
    }
  }
  return {
    date,
    count,
    cashSales: format(cash, 2),
    creditSales: format(credit, 2),
    collections: format(coll, 2),
    returnsGood: format(good, 2),
    returnsDamaged: format(damaged, 2),
    cashRefunds: format(refunds, 2),
    expenses: format(spent, 2),
    expectedCash: format(cash + coll - refunds - spent, 2),
  };
}

/** Drops receipts older than `keepDays` so the local table cannot grow without bound. */
export function pruneReceipts(receipts: Receipt[], today: string, keepDays = 30): Receipt[] {
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const min = cutoff.toISOString().slice(0, 10);
  return receipts.filter((r) => r.date >= min);
}

export interface ReceiptLabels {
  title: Record<ReceiptKind, string>;
  customer: string;
  date: string;
  total: string;
  estimate: string;
  ref: string;
}

/** Plain-text receipt, shared through the OS share sheet (print, messaging, PDF-to-file by the target app). */
export function receiptText(r: Receipt, L: ReceiptLabels): string {
  const out: string[] = [L.title[r.kind], `${L.date}: ${r.date}`];
  if (r.customerName) out.push(`${L.customer}: ${r.customerName}`);
  out.push('------------------------');
  for (const l of r.lines) {
    out.push(l.amount ? `${l.name}  x ${l.quantity}  =  ${l.amount}` : `${l.name}  x ${l.quantity}`);
  }
  out.push('------------------------');
  out.push(`${L.total}: ${r.total}`);
  out.push(L.estimate);
  out.push(`${L.ref}: ${r.opId.slice(0, 8)}`);
  return out.join('\n');
}
