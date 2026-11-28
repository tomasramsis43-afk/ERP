import { SnapshotMismatchError, mergeSnapshot } from './snapshotMerge';

const prev = {
  representative: { id: 'r' },
  customers: [{ id: 'c1', code: 'C1', balance: '10.00' }, { id: 'c2', code: 'C2', balance: '5.00' }],
  customerPrices: [],
  products: [{ id: 'p1', code: 'P1', retailPrice: '5' }, { id: 'p2', code: 'P2', retailPrice: '7' }],
  vanStock: [],
  serverTime: 't0',
};

describe('mergeSnapshot', () => {
  it('replaces everything for a FULL or untagged snapshot', () => {
    const r = mergeSnapshot(prev, { serverTime: 't1', representative: { id: 'r2' }, customers: [], products: [], customerPrices: [], vanStock: [] });
    expect(r).toMatchObject({ serverTime: 't1', customers: [], products: [] });
  });

  it('merges a delta: changed product replaces, removed product goes, balances refresh', () => {
    const r = mergeSnapshot(prev, {
      mode: 'DELTA', serverTime: 't1', customers: [], customerIds: ['c1', 'c2'],
      customerBalances: [{ id: 'c1', balance: '99.00' }, { id: 'c2', balance: '5.00' }],
      products: [{ id: 'p1', code: 'P1', retailPrice: '6' }, { id: 'p3', code: 'P3', retailPrice: '1' }],
      removedProductIds: ['p2'], customerPrices: [], vanStock: [{ productId: 'p1', quantity: '3' }],
    }) as { products: { id: string; retailPrice: string }[]; customers: { id: string; balance: string }[]; vanStock: unknown[] };
    expect(r.products.map((p) => [p.id, p.retailPrice])).toEqual([['p1', '6'], ['p3', '1']]);
    expect(r.customers.find((c) => c.id === 'c1')?.balance).toBe('99.00');
    expect(r.vanStock).toHaveLength(1);
  });

  it('drops customers that left the route and adds new ones from the delta', () => {
    const r = mergeSnapshot(prev, {
      mode: 'DELTA', serverTime: 't1', customers: [{ id: 'c3', code: 'C3', balance: '0.00' }], customerIds: ['c1', 'c3'],
      customerBalances: [{ id: 'c1', balance: '10.00' }, { id: 'c3', balance: '0.00' }], products: [], removedProductIds: [], customerPrices: [], vanStock: [],
    }) as { customers: { id: string }[] };
    expect(r.customers.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('refuses a delta when nothing is stored, or a customer is unknown locally', () => {
    expect(() => mergeSnapshot({}, { mode: 'DELTA', serverTime: 't1' })).toThrow(SnapshotMismatchError);
    expect(() => mergeSnapshot(prev, { mode: 'DELTA', serverTime: 't1', customers: [], customerIds: ['c9'], customerBalances: [], products: [] })).toThrow(SnapshotMismatchError);
  });
});
