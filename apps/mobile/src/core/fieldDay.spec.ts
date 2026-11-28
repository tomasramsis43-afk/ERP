import { CustomerLike, addMoney, customerStatus, dayPart, displayMoney, groupDigits, isOverLimit, splitRoute, todayISO } from './fieldDay';

const customer = (over: Partial<CustomerLike> & Pick<CustomerLike, 'id' | 'code'>): CustomerLike => ({
  nameAr: over.id,
  nameEn: null,
  balance: '0.00',
  creditLimit: '0.00',
  routeSequence: null,
  ...over,
});

describe('money helpers', () => {
  it('adds decimal strings exactly, without floating point drift', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('12450.00', '4200.55', '0.45')).toBe('16651.00');
  });

  it('treats missing or malformed amounts as zero instead of throwing', () => {
    expect(addMoney(undefined, null, '', 'not-a-number')).toBe('0.00');
  });

  it('groups thousands and keeps the sign and decimals', () => {
    expect(groupDigits('12450.00')).toBe('12,450.00');
    expect(groupDigits('-1234567.50')).toBe('-1,234,567.50');
    expect(groupDigits('999')).toBe('999');
  });

  it('drops a trailing .00 for the dashboard cards', () => {
    expect(displayMoney('12450.00')).toBe('12,450');
    expect(displayMoney('350.25')).toBe('350.25');
  });
});

describe('customerStatus', () => {
  it('is paid when nothing is owed', () => {
    expect(customerStatus({ balance: '0.00', creditLimit: '1000.00' })).toBe('PAID');
    expect(customerStatus({ balance: '-50.00', creditLimit: '1000.00' })).toBe('PAID');
  });

  it('is due when there is a balance inside the limit', () => {
    expect(customerStatus({ balance: '500.00', creditLimit: '1000.00' })).toBe('DUE');
  });

  it('flags a balance above the credit limit, but never when the limit is zero', () => {
    expect(customerStatus({ balance: '1000.01', creditLimit: '1000.00' })).toBe('OVER_LIMIT');
    expect(customerStatus({ balance: '500.00', creditLimit: '0.00' })).toBe('DUE');
    expect(isOverLimit({ balance: '1.00', creditLimit: '0.00' })).toBe(false);
  });
});

describe('splitRoute', () => {
  const a = customer({ id: 'a', code: 'C-3', routeSequence: 3 });
  const b = customer({ id: 'b', code: 'C-1', routeSequence: 1 });
  const c = customer({ id: 'c', code: 'C-2', routeSequence: 2 });

  it('separates visited customers and keeps route order in both lists', () => {
    const split = splitRoute([a, b, c], [{ customerId: 'c', outcome: 'NO_ORDER' }]);
    expect(split.pending.map((x) => x.id)).toEqual(['b', 'a']);
    expect(split.visited.map((x) => x.id)).toEqual(['c']);
    expect(split.total).toBe(3);
    expect(split.visitedCount).toBe(1);
    expect(split.percent).toBe(33);
  });

  it('puts customers without a route sequence last, ordered by code', () => {
    const x = customer({ id: 'x', code: 'C-9' });
    const y = customer({ id: 'y', code: 'C-8' });
    expect(splitRoute([x, b, y], []).pending.map((v) => v.id)).toEqual(['b', 'y', 'x']);
  });

  it('reports 0% for an empty route', () => {
    const split = splitRoute([], []);
    expect(split.percent).toBe(0);
    expect(split.total).toBe(0);
  });
});

describe('dates', () => {
  it('maps the hour to a greeting part', () => {
    expect(dayPart(6)).toBe('morning');
    expect(dayPart(12)).toBe('afternoon');
    expect(dayPart(17)).toBe('evening');
  });

  it('formats today as the same yyyy-mm-dd the receipts use', () => {
    expect(todayISO(new Date('2026-11-28T13:56:20Z'))).toBe('2026-11-28');
  });
});
