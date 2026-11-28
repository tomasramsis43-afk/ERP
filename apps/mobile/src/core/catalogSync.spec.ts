import { Product } from './cart';
import { FULL_REFRESH_MS, mergeProducts, productsSince } from './catalogSync';

const p = (id: string, code: string, nameAr = id): Product => ({
  id, code, barcode: null, nameAr, nameEn: null, baseUnitId: 'u', retailPrice: '1', wholesalePrice: '1', units: [],
});
const NOW = Date.parse('2026-11-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('productsSince', () => {
  it('asks for everything when there is no cursor or no full refresh recorded', () => {
    expect(productsSince(null, hoursAgo(1), NOW)).toBeNull();
    expect(productsSince(hoursAgo(1), null, NOW)).toBeNull();
  });
  it('uses the cursor while the last full refresh is under 24 hours old', () => {
    expect(productsSince(hoursAgo(1), hoursAgo(23), NOW)).toBe(hoursAgo(1));
  });
  it('forces a full refresh at 24 hours, and on unreadable or future times', () => {
    expect(productsSince(hoursAgo(1), hoursAgo(24), NOW)).toBeNull();
    expect(productsSince(hoursAgo(1), new Date(NOW - FULL_REFRESH_MS - 1).toISOString(), NOW)).toBeNull();
    expect(productsSince('garbage', hoursAgo(1), NOW)).toBeNull();
    expect(productsSince(hoursAgo(1), new Date(NOW + 60_000).toISOString(), NOW)).toBeNull();
  });
});

describe('mergeProducts', () => {
  const base = [p('a', 'A-1'), p('b', 'B-2'), p('c', 'C-3')];
  it('replaces changed products, adds new ones, keeps the rest sorted by code', () => {
    const out = mergeProducts(base, [p('b', 'B-2', 'renamed'), p('d', 'A-0')]);
    expect(out.map((x) => x.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(out.find((x) => x.id === 'b')?.nameAr).toBe('renamed');
  });
  it('removes inactive products and strips the flag from stored ones', () => {
    const out = mergeProducts(base, [{ ...p('a', 'A-1'), isActive: false }, { ...p('c', 'C-3', 'x'), isActive: true }]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c']);
    expect('isActive' in out[1]).toBe(false);
  });
  it('an empty delta changes nothing and the input is not mutated', () => {
    expect(mergeProducts(base, [])).toEqual(base);
    expect(base).toHaveLength(3);
  });
  it('ignores a product that is inactive and unknown', () => {
    expect(mergeProducts(base, [{ ...p('z', 'Z'), isActive: false }])).toEqual(base);
  });
});
