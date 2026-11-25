import { CartLine, Product, applySale, baseQuantity, cartTotal, stockShortages } from './cart';
import { format, lineAmount, parseScaled } from './money';

const carton = 'unit-carton';
const piece = 'unit-piece';
const product: Product = {
  id: 'p1', code: 'P1', nameAr: 'صنف', nameEn: 'Item', baseUnitId: piece,
  retailPrice: '20.0000', wholesalePrice: '15.0000',
  units: [{ unitId: carton, factor: '12.0000' }],
};
const products = new Map([[product.id, product]]);

describe('money', () => {
  it('parses and formats without floating point', () => {
    expect(format(parseScaled('0.1', 4) + parseScaled('0.2', 4), 4)).toBe('0.3000');
    expect(format(parseScaled('-12.5', 2), 2)).toBe('-12.50');
  });
  it('rounds line amounts half up to 2 decimals', () => {
    expect(format(lineAmount(parseScaled('3', 4), parseScaled('0.3350', 4)), 2)).toBe('1.01'); // 1.005 → 1.01
    expect(format(lineAmount(parseScaled('3', 4), parseScaled('0.3333', 4)), 2)).toBe('1.00');
  });
  it('rejects garbage', () => {
    expect(() => parseScaled('1,5', 2)).toThrow();
  });
});

describe('cart', () => {
  it('prices a line in the base unit from the price list', () => {
    expect(cartTotal(products, [{ productId: 'p1', quantity: '5' }], null, [], 'RETAIL')).toBe('100.00');
    expect(cartTotal(products, [{ productId: 'p1', quantity: '5' }], null, [], 'WHOLESALE')).toBe('75.00');
  });
  it('a customer price beats the price list', () => {
    const prices = [{ customerId: 'c1', productId: 'p1', price: '18.5000' }];
    expect(cartTotal(products, [{ productId: 'p1', quantity: '2' }], 'c1', prices, 'RETAIL')).toBe('37.00');
    expect(cartTotal(products, [{ productId: 'p1', quantity: '2' }], 'c2', prices, 'RETAIL')).toBe('40.00');
  });
  it('converts units: a carton of 12 sells as 12 base units', () => {
    const line: CartLine = { productId: 'p1', quantity: '2', unitId: carton };
    expect(format(baseQuantity(product, line), 4)).toBe('24.0000');
    expect(cartTotal(products, [line], null, [], 'RETAIL')).toBe('480.00');
  });
  it('refuses a unit that is not the product’s', () => {
    expect(() => baseQuantity(product, { productId: 'p1', quantity: '1', unitId: 'other' })).toThrow();
  });
  it('detects shortages across several lines of the same product', () => {
    const stock = new Map([['p1', '30.0000']]);
    const lines: CartLine[] = [{ productId: 'p1', quantity: '2', unitId: carton }, { productId: 'p1', quantity: '10' }];
    expect(stockShortages(products, lines, stock)).toEqual([{ productId: 'p1', requested: '34.0000', available: '30.0000' }]);
    expect(stockShortages(products, [{ productId: 'p1', quantity: '30' }], stock)).toEqual([]);
  });
  it('applies a sale and a return to the local van stock', () => {
    const stock = new Map([['p1', '30.0000']]);
    const afterSale = applySale(stock, products, [{ productId: 'p1', quantity: '2', unitId: carton }]);
    expect(afterSale.get('p1')).toBe('6.0000');
    expect(applySale(afterSale, products, [{ productId: 'p1', quantity: '1' }], 1).get('p1')).toBe('7.0000');
    expect(stock.get('p1')).toBe('30.0000'); // original untouched
  });
});
