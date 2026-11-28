import { Scaled, format, lineAmount, parseScaled } from './money';

export interface ProductUnit {
  unitId: string;
  factor: string;
  barcode?: string | null;
}

export interface Product {
  id: string;
  code: string;
  barcode?: string | null;
  nameAr: string;
  nameEn: string | null;
  baseUnitId: string;
  retailPrice: string;
  wholesalePrice: string;
  units: ProductUnit[];
}

export interface CustomerPrice {
  customerId: string;
  productId: string;
  price: string;
}

export interface CartLine {
  productId: string;
  /** Quantity in the chosen unit (4 decimals max). */
  quantity: string;
  /** Omitted = the product's base unit. */
  unitId?: string;
  /** Absolute discount for the whole line, up to 2 decimals. Needs the sales:discount permission on the server. */
  discount?: string;
}

export type PriceList = 'RETAIL' | 'WHOLESALE';

/** What the quantity field accepts. A half-typed value is not a sale. */
export function isPositiveQuantity(value: string): boolean {
  return /^\d{1,10}(\.\d{1,4})?$/.test(value) && Number(value) > 0;
}

/** Factor of the chosen unit relative to the base unit (1 for the base unit). */
export function unitFactor(product: Product, unitId?: string): Scaled {
  if (!unitId || unitId === product.baseUnitId) return 10_000n;
  const u = product.units.find((x) => x.unitId === unitId);
  if (!u) throw new Error('Unit does not belong to this product');
  return parseScaled(u.factor, 4);
}

/** Customer-specific price wins over the price list; prices are per base unit. */
export function basePrice(product: Product, customerId: string | null, prices: CustomerPrice[], list: PriceList): Scaled {
  const special = customerId ? prices.find((p) => p.customerId === customerId && p.productId === product.id) : undefined;
  return parseScaled(special ? special.price : list === 'WHOLESALE' ? product.wholesalePrice : product.retailPrice, 4);
}

/** Quantity expressed in base units (what stock is counted in). */
export function baseQuantity(product: Product, line: CartLine): Scaled {
  const q = parseScaled(line.quantity, 4);
  return (q * unitFactor(product, line.unitId)) / 10_000n;
}

/** Empty means "no discount"; anything else must be a plain amount with at most 2 decimals. */
export function isValidDiscount(value: string | undefined): boolean {
  return !value || /^\d{1,12}(\.\d{1,2})?$/.test(value);
}

/** Estimated line total after the discount (never below zero); the server remains the authority and recomputes it. */
export function lineTotal(product: Product, line: CartLine, customerId: string | null, prices: CustomerPrice[], list: PriceList): Scaled {
  const gross = lineAmount(baseQuantity(product, line), basePrice(product, customerId, prices, list));
  const discount = line.discount && isValidDiscount(line.discount) ? parseScaled(line.discount, 2) : 0n;
  return discount >= gross ? 0n : gross - discount;
}

export function cartTotal(products: Map<string, Product>, lines: CartLine[], customerId: string | null, prices: CustomerPrice[], list: PriceList): string {
  let total = 0n;
  for (const l of lines) {
    const p = products.get(l.productId);
    if (!p) throw new Error('Unknown product in cart');
    total += lineTotal(p, l, customerId, prices, list);
  }
  return format(total, 2);
}

/**
 * Total shown on screen while a user is typing. An empty or half-typed quantity counts as zero so the
 * screen cannot crash; `save()` still rejects it with `isPositiveQuantity` before anything is written.
 */
export function estimateCartTotal(products: Map<string, Product>, lines: CartLine[], customerId: string | null, prices: CustomerPrice[], list: PriceList): string {
  return cartTotal(products, lines.filter((l) => isPositiveQuantity(l.quantity)), customerId, prices, list);
}

export interface Shortage {
  productId: string;
  requested: string;
  available: string;
}

/** Sums the cart per product (the same product may appear on several lines) and compares with the van stock. */
export function stockShortages(products: Map<string, Product>, lines: CartLine[], vanStock: Map<string, string>): Shortage[] {
  const need = new Map<string, Scaled>();
  for (const l of lines) {
    const p = products.get(l.productId);
    if (!p) throw new Error('Unknown product in cart');
    need.set(l.productId, (need.get(l.productId) ?? 0n) + baseQuantity(p, l));
  }
  const out: Shortage[] = [];
  for (const [productId, qty] of need) {
    const have = parseScaled(vanStock.get(productId) ?? '0', 4);
    if (qty > have) out.push({ productId, requested: format(qty, 4), available: format(have, 4) });
  }
  return out;
}

/** Local stock after a sale, so the next sale offline sees what is really left on the van. */
export function applySale(vanStock: Map<string, string>, products: Map<string, Product>, lines: CartLine[], sign: 1 | -1 = -1): Map<string, string> {
  const next = new Map(vanStock);
  for (const l of lines) {
    const p = products.get(l.productId)!;
    const current = parseScaled(next.get(l.productId) ?? '0', 4);
    next.set(l.productId, format(current + BigInt(sign) * baseQuantity(p, l), 4));
  }
  return next;
}
