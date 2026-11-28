import { Decimal, MoneyInput, dec } from './money';

/**
 * Weighted-average cost after removing `qty` units that were originally received at `cost` per unit
 * (cancelling a receipt). Stock value drops by exactly qty x cost, the same amount the reversing journal entry credits
 * to the inventory account, so stock valuation and the ledger stay equal.
 *
 * `onHand` is the quantity in stock (all warehouses) BEFORE the removal and `avg` the current average.
 * When nothing remains the average is kept (there is no stock to value). The result never goes below zero.
 */
export function averageCostAfterRemoval(onHand: MoneyInput, avg: MoneyInput, qty: MoneyInput, cost: MoneyInput): Decimal {
  const before = dec(onHand);
  const remaining = before.minus(dec(qty));
  if (remaining.lte(0)) return dec(avg).toDecimalPlaces(4);
  const value = before.times(dec(avg)).minus(dec(qty).times(dec(cost)));
  if (value.lte(0)) return dec(0);
  return value.div(remaining).toDecimalPlaces(4);
}
