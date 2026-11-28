import { format, parseScaled } from './money';

export type PaymentChoice = 'CASH' | 'CREDIT' | 'PARTIAL';

export interface PaymentPlan {
  /** What the invoice itself is recorded as. */
  paymentKind: 'CASH' | 'CREDIT';
  /** Amount to record as a separate collection from the customer (partial payment), or null. */
  collect: string | null;
}

export type PaymentError = 'NEED_CUSTOMER' | 'BAD_AMOUNT' | 'NOT_PARTIAL';

/**
 * A partial payment is a credit sale plus a collection for the amount paid now, so the customer's balance, the custody
 * cash and the receipts all stay exact. The paid amount must be above zero and below the (estimated) total.
 */
export function planPayment(choice: PaymentChoice, total: string, paid: string, hasCustomer: boolean): PaymentPlan | PaymentError {
  if (choice === 'CASH') return { paymentKind: 'CASH', collect: null };
  if (!hasCustomer) return 'NEED_CUSTOMER';
  if (choice === 'CREDIT') return { paymentKind: 'CREDIT', collect: null };
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(paid)) return 'BAD_AMOUNT';
  const paidScaled = parseScaled(paid, 2);
  const totalScaled = parseScaled(total, 2);
  if (paidScaled <= 0n) return 'BAD_AMOUNT';
  if (paidScaled >= totalScaled) return 'NOT_PARTIAL';
  return { paymentKind: 'CREDIT', collect: format(paidScaled, 2) };
}
