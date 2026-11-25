import { ageLines } from './aging';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const asOf = day('2026-06-30');

describe('ageLines (FIFO)', () => {
  it('buckets open charges by age', () => {
    const r = ageLines('CUSTOMER', [
      { date: day('2026-06-30'), debit: '10', credit: '0' }, // current
      { date: day('2026-06-10'), debit: '20', credit: '0' }, // 20 days
      { date: day('2026-05-01'), debit: '30', credit: '0' }, // 60 days
      { date: day('2026-03-01'), debit: '40', credit: '0' }, // 121 days
    ], asOf);
    expect(r).toMatchObject({ current: '10.00', days1to30: '20.00', days31to60: '30.00', days61to90: '0.00', over90: '40.00', total: '100.00' });
  });

  it('payments settle the oldest charges first', () => {
    const r = ageLines('CUSTOMER', [
      { date: day('2026-03-01'), debit: '40', credit: '0' },
      { date: day('2026-06-10'), debit: '20', credit: '0' },
      { date: day('2026-06-15'), debit: '0', credit: '50' },
    ], asOf);
    expect(r.over90).toBe('0.00');
    expect(r.days1to30).toBe('10.00');
    expect(r.total).toBe('10.00');
  });

  it('reports an overpayment as unapplied credit instead of netting it', () => {
    const r = ageLines('CUSTOMER', [
      { date: day('2026-06-10'), debit: '20', credit: '0' },
      { date: day('2026-06-12'), debit: '0', credit: '50' },
    ], asOf);
    expect(r.total).toBe('0.00');
    expect(r.unappliedCredit).toBe('30.00');
  });

  it('suppliers charge on credit', () => {
    const r = ageLines('SUPPLIER', [
      { date: day('2026-06-10'), debit: '0', credit: '100' },
      { date: day('2026-06-20'), debit: '40', credit: '0' },
    ], asOf);
    expect(r.total).toBe('60.00');
  });
});
