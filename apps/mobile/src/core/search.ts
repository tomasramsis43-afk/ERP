import { Product } from './cart';

/** Lower-cases, strips Arabic diacritics/tatweel and folds common letter variants so "أحمد" finds "احمد". */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .trim();
}

/**
 * Filters the catalogue by code or Arabic/English name; every word typed must match (any order).
 * `limit` caps the result so a catalogue of thousands never renders at once.
 */
export function filterProducts(products: Product[], query: string, limit = 50): Product[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return products.slice(0, limit);
  const out: Product[] = [];
  for (const p of products) {
    const hay = normalizeText(`${p.code} ${p.nameAr} ${p.nameEn ?? ''}`);
    if (words.every((w) => hay.includes(w))) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}
