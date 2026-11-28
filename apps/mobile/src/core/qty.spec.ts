import { stepQuantity } from './qty';

describe('stepQuantity', () => {
  it('adds and removes one unit exactly', () => {
    expect(stepQuantity('1', 1)).toBe('2');
    expect(stepQuantity('2.5', 1)).toBe('3.5');
    expect(stepQuantity('2.5', -1)).toBe('1.5');
  });
  it('returns null when the line should go away', () => {
    expect(stepQuantity('1', -1)).toBeNull();
    expect(stepQuantity('0.5', -1)).toBeNull();
  });
  it('treats unreadable text as zero', () => {
    expect(stepQuantity('', 1)).toBe('1');
    expect(stepQuantity('abc', 1)).toBe('1');
  });
});
