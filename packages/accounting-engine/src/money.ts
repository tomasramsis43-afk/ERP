import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal | string | number;

/** Monetary scale used across the system (EGP has 2 minor digits). */
export const MONEY_SCALE = 2;
/** Quantity / unit-cost scale (4 digits avoids drift in unit conversions). */
export const QTY_SCALE = 4;

export function dec(value: MoneyInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function roundMoney(value: MoneyInput): Decimal {
  return dec(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundQty(value: MoneyInput): Decimal {
  return dec(value).toDecimalPlaces(QTY_SCALE, Decimal.ROUND_HALF_UP);
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

export { Decimal };
