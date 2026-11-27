import { Product } from './cart';
import { lookupBarcode } from './barcode';

const p = (id: string, code: string, barcode: string | null, units: Product['units'] = []): Product => ({
  id, code, barcode, nameAr: id, nameEn: null, baseUnitId: 'pc', retailPrice: '1', wholesalePrice: '1', units,
});
const catalogue = [p('milk', 'MLK-01', '6221000000011', [{ unitId: 'ctn', factor: '12', barcode: '6221000000998' }]), p('rice', 'RCE-02', null)];

describe('lookupBarcode', () => {
  it('finds a product by barcode or by code, ignoring case and spaces', () => {
    expect(lookupBarcode(catalogue, ' 6221000000011 ')).toMatchObject({ kind: 'FOUND', product: { id: 'milk' } });
    expect(lookupBarcode(catalogue, 'rce-02')).toMatchObject({ kind: 'FOUND', product: { id: 'rice' } });
  });
  it('a unit barcode selects that unit', () => {
    expect(lookupBarcode(catalogue, '6221000000998')).toEqual({ kind: 'FOUND', product: catalogue[0], unitId: 'ctn' });
  });
  it('reports unknown and empty codes', () => {
    expect(lookupBarcode(catalogue, '000')).toEqual({ kind: 'UNKNOWN' });
    expect(lookupBarcode(catalogue, '  ')).toEqual({ kind: 'UNKNOWN' });
  });
  it('reports the same code on two products instead of guessing', () => {
    const dup = [...catalogue, p('milk2', 'X', '6221000000011')];
    expect(lookupBarcode(dup, '6221000000011')).toMatchObject({ kind: 'AMBIGUOUS' });
  });
});
