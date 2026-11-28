import { planPayment } from './payment';

describe('planPayment', () => {
  it('cash needs no customer and records no collection', () => {
    expect(planPayment('CASH', '100.00', '', false)).toEqual({ paymentKind: 'CASH', collect: null });
  });
  it('credit and partial payment need a customer', () => {
    expect(planPayment('CREDIT', '100.00', '', false)).toBe('NEED_CUSTOMER');
    expect(planPayment('PARTIAL', '100.00', '40', false)).toBe('NEED_CUSTOMER');
    expect(planPayment('CREDIT', '100.00', '', true)).toEqual({ paymentKind: 'CREDIT', collect: null });
  });
  it('a partial payment is a credit sale plus a collection of the amount paid', () => {
    expect(planPayment('PARTIAL', '100.00', '40', true)).toEqual({ paymentKind: 'CREDIT', collect: '40.00' });
    expect(planPayment('PARTIAL', '100.00', '99.5', true)).toEqual({ paymentKind: 'CREDIT', collect: '99.50' });
  });
  it('refuses a paid amount that is empty, zero, malformed, or not below the total', () => {
    expect(planPayment('PARTIAL', '100.00', '', true)).toBe('BAD_AMOUNT');
    expect(planPayment('PARTIAL', '100.00', '0', true)).toBe('BAD_AMOUNT');
    expect(planPayment('PARTIAL', '100.00', '4,5', true)).toBe('BAD_AMOUNT');
    expect(planPayment('PARTIAL', '100.00', '100', true)).toBe('NOT_PARTIAL');
    expect(planPayment('PARTIAL', '100.00', '150', true)).toBe('NOT_PARTIAL');
  });
});
