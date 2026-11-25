import { absentDaysOf, computePayLine } from './payroll-calc';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('computePayLine', () => {
  it('pays base plus allowance when nothing is deducted', () => {
    const r = computePayLine({ baseSalary: '3000', allowance: '500', absentDays: 0, advances: [] });
    expect(r.net.toFixed(2)).toBe('3500.00');
    expect(r.expense.toFixed(2)).toBe('3500.00');
  });

  it('deducts absence at base/30 per day, never more than the base', () => {
    expect(computePayLine({ baseSalary: '3000', allowance: '0', absentDays: 2, advances: [] }).absenceDeduction.toFixed(2)).toBe('200.00');
    expect(computePayLine({ baseSalary: '3000', allowance: '0', absentDays: 45, advances: [] }).absenceDeduction.toFixed(2)).toBe('3000.00');
  });

  it('recovers advances oldest first up to the monthly installment and the remaining balance', () => {
    const r = computePayLine({
      baseSalary: '3000',
      allowance: '0',
      absentDays: 0,
      advances: [
        { id: 'a', remaining: '150', monthly: '500' },
        { id: 'b', remaining: '2000', monthly: '400' },
      ],
    });
    expect(r.repayments).toEqual([{ id: 'a', amount: '150.00' }, { id: 'b', amount: '400.00' }]);
    expect(r.advanceDeduction.toFixed(2)).toBe('550.00');
    expect(r.net.toFixed(2)).toBe('2450.00');
  });

  it('never takes the net pay below zero', () => {
    const r = computePayLine({ baseSalary: '1000', allowance: '0', absentDays: 15, advances: [{ id: 'a', remaining: '5000', monthly: '5000' }] });
    expect(r.net.toFixed(2)).toBe('0.00');
    expect(r.advanceDeduction.toFixed(2)).toBe('500.00');
  });

  it('journal identity holds: expense = advances recovered + net', () => {
    const r = computePayLine({ baseSalary: '2750.50', allowance: '120', absentDays: 3, advances: [{ id: 'a', remaining: '900', monthly: '333.33' }] });
    expect(r.expense.toFixed(2)).toBe(r.advanceDeduction.plus(r.net).toFixed(2));
  });
});

describe('absentDaysOf', () => {
  it('adds the part of an unpaid leave that falls inside the month', () => {
    const days = absentDaysOf(1, [{ fromDate: d('2026-05-29'), toDate: d('2026-06-03') }], d('2026-06-01'), d('2026-06-30'));
    expect(days).toBe(1 + 3);
  });
  it('ignores leaves outside the month', () => {
    expect(absentDaysOf(0, [{ fromDate: d('2026-07-01'), toDate: d('2026-07-05') }], d('2026-06-01'), d('2026-06-30'))).toBe(0);
  });
});
