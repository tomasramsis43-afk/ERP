import { creditCheck, customerStatus, isLowStock, nextVisits, todayStats, visitedToday } from './dashboard';
import { Receipt } from './receipts';

const rc = (over: Partial<Receipt>): Receipt => ({ opId: 'x', kind: 'CASH_SALE', date: '2026-11-28', createdAt: 't', customerId: null, customerName: null, lines: [], total: '10.00', ...over });

describe('customerStatus', () => {
  it('flags customers over their limit, owing, or clear', () => {
    expect(customerStatus({ id: 'a', balance: '12000.00', creditLimit: '10000.00' })).toBe('OVER_LIMIT');
    expect(customerStatus({ id: 'a', balance: '50.00', creditLimit: '10000.00' })).toBe('DUE');
    expect(customerStatus({ id: 'a', balance: '0.00', creditLimit: '10000.00' })).toBe('CLEAR');
    expect(customerStatus({ id: 'a', balance: '99999.00', creditLimit: '0.00' })).toBe('DUE'); // no limit set
  });
});

describe('creditCheck', () => {
  it('warns before the limit and when it would be exceeded', () => {
    expect(creditCheck('0.00', '1000.00', '100.00')).toBe('OK');
    expect(creditCheck('800.00', '1000.00', '100.00')).toBe('NEAR');
    expect(creditCheck('950.00', '1000.00', '100.00')).toBe('OVER');
    expect(creditCheck('950.00', '0.00', '100.00')).toBe('NO_LIMIT');
  });
});

describe('todayStats / visits', () => {
  const rs = [
    rc({ kind: 'CASH_SALE', total: '100.00', customerId: 'c1' }),
    rc({ kind: 'CREDIT_SALE', total: '50.50', customerId: 'c2' }),
    rc({ kind: 'COLLECTION', total: '30.00', customerId: 'c1' }),
    rc({ kind: 'RETURN_GOOD', total: '5.00' }),
    rc({ kind: 'EXPENSE', total: '12.00' }),
    rc({ kind: 'CASH_SALE', total: '999.00', date: '2026-11-27' }),
  ];
  it('sums only today', () => {
    expect(todayStats(rs, '2026-11-28')).toEqual({ sales: '150.50', collections: '30.00', returns: '5.00', expenses: '12.00', operations: 5 });
  });
  it('treats receipts and logged visits as visited, then lists the biggest debtors first', () => {
    const visited = visitedToday(rs, '2026-11-28', ['c9']);
    expect([...visited].sort()).toEqual(['c1', 'c2', 'c9']);
    const customers = [
      { id: 'c1', balance: '5.00', creditLimit: '0' }, { id: 'c3', balance: '10.00', creditLimit: '0' }, { id: 'c4', balance: '300.00', creditLimit: '0' },
    ];
    expect(nextVisits(customers, visited).map((c) => c.id)).toEqual(['c4', 'c3']);
  });
});

describe('isLowStock', () => {
  it('is low at 5 or fewer, or when unknown', () => {
    expect(isLowStock('5')).toBe(true);
    expect(isLowStock('5.0001')).toBe(false);
    expect(isLowStock('40')).toBe(false);
    expect(isLowStock(undefined)).toBe(true);
  });
});
