import { Product } from './cart';
import { filterProducts, normalizeText } from './search';

const p = (id: string, code: string, nameAr: string, nameEn: string | null): Product => ({
  id, code, nameAr, nameEn, baseUnitId: 'u', retailPrice: '1', wholesalePrice: '1', units: [],
});
const items = [p('1', 'MLK-01', 'حليب كامل الدسم', 'Full Cream Milk'), p('2', 'RCE-02', 'أرز مصري', 'Egyptian Rice'), p('3', 'TEA-03', 'شاي', null)];

describe('product search', () => {
  it('finds by code, English and Arabic name, ignoring case', () => {
    expect(filterProducts(items, 'mlk').map((x) => x.id)).toEqual(['1']);
    expect(filterProducts(items, 'RICE').map((x) => x.id)).toEqual(['2']);
    expect(filterProducts(items, 'حليب').map((x) => x.id)).toEqual(['1']);
  });
  it('folds Arabic letter variants and diacritics', () => {
    expect(filterProducts(items, 'ارز').map((x) => x.id)).toEqual(['2']);
    expect(normalizeText('شَايٌ')).toBe('شاي');
  });
  it('requires every word and caps the result', () => {
    expect(filterProducts(items, 'full milk').map((x) => x.id)).toEqual(['1']);
    expect(filterProducts(items, 'full rice')).toEqual([]);
    expect(filterProducts(items, '', 2)).toHaveLength(2);
  });
});
