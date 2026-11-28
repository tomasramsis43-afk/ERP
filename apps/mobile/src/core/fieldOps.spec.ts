import { OutboxItem } from './outbox';
import { pendingNewCustomers, visitedTodayIds } from './fieldOps';

const op = (overrides: Partial<OutboxItem>): OutboxItem => ({
  opId: '11111111-2222-3333-4444-555555555555',
  type: 'CUSTOMER',
  payload: {},
  clientCreatedAt: '2026-11-28T08:00:00Z',
  status: 'PENDING',
  error: null,
  attempts: 0,
  ...overrides,
});

describe('pendingNewCustomers', () => {
  it('turns pending CUSTOMER operations into display rows', () => {
    const rows = pendingNewCustomers([
      op({ opId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', payload: { nameAr: '  متجر جديد  ', nameEn: 'New shop', phone: '0100', address: 'Main st' } }),
      op({ opId: 'ffffffff-0000-1111-2222-333333333333', type: 'SALE', payload: {} }),
      op({ opId: '99999999-aaaa-bbbb-cccc-dddddddddddd', status: 'REJECTED', payload: { nameAr: 'مرفوض' } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nameAr: 'متجر جديد', nameEn: 'New shop', phone: '0100', address: 'Main st' });
    expect(rows[0].code).toBe('…aaaaaa');
  });

  it('skips operations without a name', () => {
    expect(pendingNewCustomers([op({ payload: { nameEn: 'no arabic' } })])).toHaveLength(0);
  });
});

describe('visitedTodayIds', () => {
  it('merges server visits with pending offline visits', () => {
    const set = visitedTodayIds([{ customerId: 'a' }], [
      op({ type: 'VISIT', status: 'PENDING', payload: { customerId: 'b' } }),
      op({ type: 'VISIT', status: 'REJECTED', payload: { customerId: 'c' } }),
      op({ type: 'SALE', status: 'PENDING', payload: { customerId: 'd' } }),
    ]);
    expect([...set].sort()).toEqual(['a', 'b']);
  });
});
