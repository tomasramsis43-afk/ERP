import { formatMoney, formatQty, queryString } from './format';
import { NAV_LABELS, dirOf, parseLang } from './i18n';

describe('formatMoney', () => {
  it('groups thousands and keeps two decimals exactly', () => {
    expect(formatMoney('1234567.5')).toBe('1,234,567.50');
    expect(formatMoney('-0.1')).toBe('-0.10');
    expect(formatMoney('12345678901234567.89')).toBe('12,345,678,901,234,567.89'); // beyond float precision
  });
  it('passes through empty and non-numeric values', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney('n/a')).toBe('n/a');
  });
});

describe('formatQty', () => {
  it('drops trailing zeros and groups thousands', () => {
    expect(formatQty('12.5000')).toBe('12.5');
    expect(formatQty('1000.0000')).toBe('1,000');
  });
});

describe('queryString', () => {
  it('drops empty values and encodes the rest', () => {
    expect(queryString({ a: 'x y', b: '', c: undefined, d: 3 })).toBe('?a=x+y&d=3');
    expect(queryString({})).toBe('');
  });
});

describe('i18n', () => {
  it('has an Arabic and an English label for every navigation entry', () => {
    for (const value of Object.values(NAV_LABELS)) {
      expect(value).toHaveLength(2);
      expect(value[0]).toBeTruthy();
      expect(value[1]).toBeTruthy();
    }
  });
  it('Arabic is right-to-left, English left-to-right; unknown falls back to Arabic', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(parseLang('fr')).toBe('ar');
    expect(parseLang('en')).toBe('en');
  });
});
