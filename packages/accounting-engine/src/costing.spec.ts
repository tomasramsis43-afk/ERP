import { averageCostAfterRemoval } from './costing';

describe('averageCostAfterRemoval', () => {
  it('cancelling the first of two receipts leaves the second one\'s cost', () => {
    // 10 @ 10 then 10 @ 20 -> average 15; cancel the first receipt
    expect(averageCostAfterRemoval('20', '15', '10', '10').toFixed(4)).toBe('20.0000');
  });

  it('stock value falls by exactly qty x cost (matches the reversing journal entry)', () => {
    const avg = averageCostAfterRemoval('20', '15', '10', '10');
    const valueBefore = 20 * 15;
    const valueAfter = 10 * Number(avg);
    expect(valueBefore - valueAfter).toBe(10 * 10);
  });

  it('keeps the average when nothing remains', () => {
    expect(averageCostAfterRemoval('10', '12.5', '10', '10').toFixed(4)).toBe('12.5000');
  });

  it('does not go negative when later sales reduced the value below the cancelled cost', () => {
    expect(averageCostAfterRemoval('11', '2', '10', '20').toFixed(4)).toBe('0.0000');
  });

  it('rounds to 4 decimals', () => {
    expect(averageCostAfterRemoval('3', '10', '1', '4').toFixed(4)).toBe('13.0000');
    expect(averageCostAfterRemoval('7', '10', '2', '3').toFixed(4)).toBe('12.8000');
    expect(averageCostAfterRemoval('9', '10', '2', '3.3333').toFixed(4)).toBe('11.9048');
  });
});
