import { impliedVisit, routeProgress, visitOrder } from './route';

describe('route helpers', () => {
  const list = [
    { id: 'a', code: 'C3', routeSequence: null },
    { id: 'b', code: 'C2', routeSequence: 2 },
    { id: 'c', code: 'C9', routeSequence: 1 },
    { id: 'd', code: 'C1', routeSequence: null },
  ];
  it('orders planned stops first, then the rest by code', () => {
    expect(visitOrder(list).map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']); // the input is not mutated
  });
  it('counts visited customers', () => {
    expect(routeProgress(list, new Map([['a', 'SALE' as const], ['zzz', 'NO_ORDER' as const]]))).toEqual({ done: 1, total: 4 });
  });
  it('a served customer counts as visited unless a visit was logged by hand', () => {
    expect(impliedVisit(undefined, 'SALE')).toBe('SALE');
    expect(impliedVisit('SHOP_CLOSED', 'SALE')).toBeNull();
  });
});
