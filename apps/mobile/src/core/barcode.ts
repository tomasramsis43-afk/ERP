import { Product } from './cart';

export type ScanResult =
  | { kind: 'FOUND'; product: Product; unitId?: string }
  | { kind: 'UNKNOWN' }
  | { kind: 'AMBIGUOUS'; products: Product[] };

const clean = (v: string) => v.trim().toLowerCase();

/**
 * Looks a scanned code up in the local catalogue: the product barcode, a unit barcode (a carton code selects that
 * unit) or the product code. The same code on two different products is reported, never guessed.
 */
export function lookupBarcode(products: Product[], scanned: string): ScanResult {
  const code = clean(scanned);
  if (!code) return { kind: 'UNKNOWN' };
  const hits: { product: Product; unitId?: string }[] = [];
  for (const p of products) {
    if (p.barcode && clean(p.barcode) === code) hits.push({ product: p });
    else if (p.code && clean(p.code) === code) hits.push({ product: p });
    else {
      const u = p.units.find((x) => x.barcode && clean(x.barcode) === code);
      if (u) hits.push({ product: p, unitId: u.unitId });
    }
  }
  if (hits.length === 0) return { kind: 'UNKNOWN' };
  const distinct = new Set(hits.map((h) => h.product.id));
  if (distinct.size > 1) return { kind: 'AMBIGUOUS', products: hits.map((h) => h.product) };
  return { kind: 'FOUND', ...hits[0] };
}
