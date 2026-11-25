import { Decimal, dec, roundMoney } from '@erp/accounting-engine';

const DAY = 86_400_000;
/** Salaries are prorated on a fixed 30-day month. */
export const DAYS_IN_PAY_MONTH = 30;

export interface OpenAdvance {
  id: string;
  remaining: string;
  monthly: string;
}

export interface PayInput {
  baseSalary: string;
  allowance: string;
  absentDays: number;
  advances: OpenAdvance[];
}

export interface PayResult {
  absenceDeduction: Decimal;
  advanceDeduction: Decimal;
  /** Salary cost for the month: base + allowance − absence. */
  expense: Decimal;
  net: Decimal;
  repayments: { id: string; amount: string }[];
}

/** Days of unpaid leave inside the month, plus recorded absences. (ON_LEAVE days are never ABSENT, so nothing is counted twice.) */
export function absentDaysOf(
  absentRecords: number,
  unpaidLeaves: { fromDate: Date; toDate: Date }[],
  monthStart: Date,
  monthEnd: Date,
): number {
  let days = absentRecords;
  for (const l of unpaidLeaves) {
    const from = Math.max(l.fromDate.getTime(), monthStart.getTime());
    const to = Math.min(l.toDate.getTime(), monthEnd.getTime());
    if (to >= from) days += Math.round((to - from) / DAY) + 1;
  }
  return days;
}

export function computePayLine(i: PayInput): PayResult {
  const base = dec(i.baseSalary);
  const gross = base.plus(i.allowance);
  const absence = Decimal.min(base, roundMoney(base.div(DAYS_IN_PAY_MONTH).times(i.absentDays)));
  const expense = gross.minus(absence);

  // Advances are recovered oldest first, never beyond what is left and never taking the net below zero.
  let room = expense;
  const repayments: { id: string; amount: string }[] = [];
  let advanceDeduction = new Decimal(0);
  for (const a of i.advances) {
    if (room.lte(0)) break;
    const take = Decimal.min(dec(a.monthly), dec(a.remaining), room);
    if (take.lte(0)) continue;
    repayments.push({ id: a.id, amount: take.toFixed(2) });
    advanceDeduction = advanceDeduction.plus(take);
    room = room.minus(take);
  }
  return { absenceDeduction: absence, advanceDeduction, expense, net: expense.minus(advanceDeduction), repayments };
}
