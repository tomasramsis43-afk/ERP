import { InvalidLineError, UnbalancedEntryError, reverseLines, validateJournal } from './journal';

describe('validateJournal', () => {
  it('accepts a balanced entry', () => {
    const r = validateJournal([
      { accountId: 'cash', debit: '100.00', credit: 0 },
      { accountId: 'sales', debit: 0, credit: '100.00' },
    ]);
    expect(r.totalDebit.toFixed(2)).toBe('100.00');
    expect(r.totalCredit.toFixed(2)).toBe('100.00');
  });

  it('avoids floating point drift (0.1 + 0.2)', () => {
    const r = validateJournal([
      { accountId: 'a', debit: '0.1', credit: 0 },
      { accountId: 'b', debit: '0.2', credit: 0 },
      { accountId: 'c', debit: 0, credit: '0.3' },
    ]);
    expect(r.totalDebit.eq(r.totalCredit)).toBe(true);
  });

  it('rejects an unbalanced entry', () => {
    expect(() =>
      validateJournal([
        { accountId: 'a', debit: 100, credit: 0 },
        { accountId: 'b', debit: 0, credit: 99.99 },
      ]),
    ).toThrow(UnbalancedEntryError);
  });

  it('rejects lines with both sides or neither side', () => {
    expect(() =>
      validateJournal([
        { accountId: 'a', debit: 10, credit: 10 },
        { accountId: 'b', debit: 0, credit: 0 },
      ]),
    ).toThrow(InvalidLineError);
  });

  it('rejects negative amounts and single-line entries', () => {
    expect(() =>
      validateJournal([
        { accountId: 'a', debit: -5, credit: 0 },
        { accountId: 'b', debit: 0, credit: -5 },
      ]),
    ).toThrow(InvalidLineError);
    expect(() => validateJournal([{ accountId: 'a', debit: 5, credit: 0 }])).toThrow(InvalidLineError);
  });

  it('reversal of a balanced entry is balanced', () => {
    const original = [
      { accountId: 'cash', debit: 250, credit: 0 },
      { accountId: 'sales', debit: 0, credit: 250 },
    ];
    const reversed = reverseLines(original);
    expect(reversed[0]).toMatchObject({ accountId: 'cash', debit: expect.anything() });
    expect(() => validateJournal(reversed)).not.toThrow();
  });
});
