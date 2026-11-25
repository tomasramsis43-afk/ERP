import { Decimal, dec } from '@erp/accounting-engine';

export interface AgingLine {
  date: Date;
  debit: { toString(): string };
  credit: { toString(): string };
}

export interface AgingResult {
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
  unappliedCredit: string;
}

/**
 * FIFO aging of one party's journal lines (chronological order required).
 * Customers charge on debit, suppliers on credit; the opposite side settles the oldest charges first.
 */
export function ageLines(type: 'CUSTOMER' | 'SUPPLIER', lines: AgingLine[], asOf: Date): AgingResult {
  const charges: { date: Date; remaining: Decimal }[] = [];
  let settlements = new Decimal(0);
  for (const l of lines) {
    const d = dec(l.debit.toString());
    const c = dec(l.credit.toString());
    const [charge, settle] = type === 'CUSTOMER' ? [d, c] : [c, d];
    if (charge.gt(0)) charges.push({ date: l.date, remaining: charge });
    settlements = settlements.plus(settle);
  }
  for (const ch of charges) {
    if (settlements.lte(0)) break;
    const used = Decimal.min(ch.remaining, settlements);
    ch.remaining = ch.remaining.minus(used);
    settlements = settlements.minus(used);
  }
  const buckets = { current: new Decimal(0), d30: new Decimal(0), d60: new Decimal(0), d90: new Decimal(0), over90: new Decimal(0) };
  for (const ch of charges) {
    if (ch.remaining.lte(0)) continue;
    const days = Math.floor((asOf.getTime() - ch.date.getTime()) / 86_400_000);
    const key = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'over90';
    buckets[key] = buckets[key].plus(ch.remaining);
  }
  const total = Object.values(buckets).reduce((a, b) => a.plus(b), new Decimal(0));
  return {
    current: buckets.current.toFixed(2),
    days1to30: buckets.d30.toFixed(2),
    days31to60: buckets.d60.toFixed(2),
    days61to90: buckets.d90.toFixed(2),
    over90: buckets.over90.toFixed(2),
    total: total.toFixed(2),
    // Unapplied credit (overpayment / advance) is reported separately, never netted silently.
    unappliedCredit: settlements.gt(0) ? settlements.toFixed(2) : '0.00',
  };
}
