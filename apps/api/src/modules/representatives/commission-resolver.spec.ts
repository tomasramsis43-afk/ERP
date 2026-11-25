import { RuleLike, pickRule } from './commission-resolver';

const base = (over: Partial<RuleLike>): RuleLike => ({
  id: 'r',
  representativeId: null,
  basis: 'SALES',
  ratePercent: '1',
  productId: null,
  customerId: null,
  geoAreaId: null,
  createdAt: new Date('2026-01-01'),
  ...over,
});

describe('pickRule', () => {
  const ctx = { representativeId: 'rep1', productId: 'p1', customerId: 'c1', geoAreaId: 'g1' };

  it('returns undefined when nothing matches', () => {
    expect(pickRule([base({ productId: 'other' })], ctx, ['SALES'])).toBeUndefined();
  });

  it('ignores rules of another basis', () => {
    expect(pickRule([base({ basis: 'COLLECTIONS' })], ctx, ['SALES', 'MARGIN'])).toBeUndefined();
  });

  it('prefers the more specific rule: product beats customer beats area beats general', () => {
    const general = base({ id: 'general' });
    const area = base({ id: 'area', geoAreaId: 'g1' });
    const customer = base({ id: 'customer', customerId: 'c1' });
    const product = base({ id: 'product', productId: 'p1' });
    expect(pickRule([general, area, customer, product], ctx, ['SALES'])?.id).toBe('product');
    expect(pickRule([general, area, customer], ctx, ['SALES'])?.id).toBe('customer');
    expect(pickRule([general, area], ctx, ['SALES'])?.id).toBe('area');
    expect(pickRule([general], ctx, ['SALES'])?.id).toBe('general');
  });

  it('a representative-specific rule beats a product-specific rule for everyone', () => {
    const forEveryone = base({ id: 'product', productId: 'p1' });
    const forRep = base({ id: 'rep', representativeId: 'rep1' });
    expect(pickRule([forEveryone, forRep], ctx, ['SALES'])?.id).toBe('rep');
  });

  it("does not apply another representative's rule", () => {
    expect(pickRule([base({ representativeId: 'rep2' })], ctx, ['SALES'])).toBeUndefined();
  });

  it('breaks ties with the newest rule', () => {
    const older = base({ id: 'older', createdAt: new Date('2026-01-01') });
    const newer = base({ id: 'newer', createdAt: new Date('2026-06-01') });
    expect(pickRule([newer, older], ctx, ['SALES'])?.id).toBe('newer');
    expect(pickRule([older, newer], ctx, ['SALES'])?.id).toBe('newer');
  });

  it('a walk-in sale (no customer) only matches rules without a customer', () => {
    const walkIn = { representativeId: 'rep1', productId: 'p1', customerId: null, geoAreaId: null };
    expect(pickRule([base({ id: 'c', customerId: 'c1' })], walkIn, ['SALES'])).toBeUndefined();
    expect(pickRule([base({ id: 'g' })], walkIn, ['SALES'])?.id).toBe('g');
  });
});
