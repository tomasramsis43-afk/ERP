import { Receipt, pruneReceipts, receiptText, summarizeDay } from './receipts';

const base = { customerId: null, customerName: null, lines: [], createdAt: '2026-11-27T08:00:00Z' };
const r = (opId: string, kind: Receipt['kind'], total: string, date = '2026-11-27'): Receipt => ({ ...base, opId, kind, total, date });

describe('summarizeDay', () => {
  it('sums each kind exactly, ignoring other days', () => {
    const s = summarizeDay(
      [
        r('1', 'CASH_SALE', '100.10'),
        r('2', 'CASH_SALE', '0.20'),
        r('3', 'CREDIT_SALE', '50.00'),
        r('4', 'COLLECTION', '30.05'),
        r('5', 'RETURN_GOOD', '10.00'),
        r('6', 'RETURN_DAMAGED', '5.50'),
        r('7', 'CASH_SALE', '999.00', '2026-11-26'),
        { ...r('8', 'RETURN_GOOD', '4.00'), cashRefund: true },
      ],
      '2026-11-27',
    );
    expect(s).toEqual({
      date: '2026-11-27',
      count: 7,
      cashSales: '100.30',
      creditSales: '50.00',
      collections: '30.05',
      returnsGood: '14.00',
      returnsDamaged: '5.50',
      cashRefunds: '4.00',
      expenses: '0.00',
      expectedCash: '126.35',
    });
  });

  it('is all zeros for an empty day', () => {
    expect(summarizeDay([], '2026-11-27').expectedCash).toBe('0.00');
  });
});

describe('pruneReceipts', () => {
  it('keeps the last N days only', () => {
    const kept = pruneReceipts([r('a', 'CASH_SALE', '1', '2026-10-01'), r('b', 'CASH_SALE', '1', '2026-11-20')], '2026-11-27', 30);
    expect(kept.map((x) => x.opId)).toEqual(['b']);
  });
});

describe('receiptText', () => {
  it('lists lines, total and a short reference', () => {
    const text = receiptText(
      { ...r('abcdef12-0000', 'CASH_SALE', '24.00'), customerName: 'Ali', lines: [{ name: 'Tea', quantity: '2', amount: '24.00' }] },
      { title: { CASH_SALE: 'Cash sale', CREDIT_SALE: '', RETURN_GOOD: '', RETURN_DAMAGED: '', COLLECTION: '', EXPENSE: '' }, customer: 'Customer', date: 'Date', total: 'Total', estimate: 'Estimate', ref: 'Ref' },
    );
    expect(text).toContain('Cash sale');
    expect(text).toContain('Customer: Ali');
    expect(text).toContain('Tea  x 2  =  24.00');
    expect(text).toContain('Total: 24.00');
    expect(text).toContain('Ref: abcdef12');
  });
});

describe('expenses', () => {
  it('reduce the expected cash', () => {
    const base = { customerId: null, customerName: null, lines: [], createdAt: 'x', date: '2026-11-28' };
    const s = summarizeDay([
      { ...base, opId: 'a', kind: 'CASH_SALE', total: '100.00' },
      { ...base, opId: 'b', kind: 'EXPENSE', total: '30.50' },
    ], '2026-11-28');
    expect(s.expenses).toBe('30.50');
    expect(s.expectedCash).toBe('69.50');
  });
});
