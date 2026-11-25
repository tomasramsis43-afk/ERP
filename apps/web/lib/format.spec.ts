import { formatMoney, queryString } from './format';
import { dict, dirOf, parseLang } from './i18n';

describe('formatMoney', () => {
  it('groups thousands and keeps two decimals exactly', () => {
    expect(formatMoney('1234567.5')).toBe('1,234,567.50');
    expect(formatMoney('-0.1')).toBe('-0.10');
    expect(formatMoney('12345678901234567.89')).toBe('12,345,678,901,234,567.89'); // beyond float precision
  });
  it('uses Arabic digits and separators in Arabic', () => {
    expect(formatMoney('1234.5', 'ar')).toBe('١٬٢٣٤٫٥٠');
  });
  it('passes through empty and non-numeric values', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney('n/a')).toBe('n/a');
  });
});

describe('queryString', () => {
  it('drops empty values and encodes the rest', () => {
    expect(queryString({ a: 'x y', b: '', c: undefined, d: 3 })).toBe('?a=x+y&d=3');
    expect(queryString({})).toBe('');
  });
});

describe('i18n', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(dict.ar).sort()).toEqual(Object.keys(dict.en).sort());
  });
  it('Arabic is right-to-left, English left-to-right; unknown falls back to Arabic', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(parseLang('fr')).toBe('ar');
    expect(parseLang('en')).toBe('en');
  });
});
