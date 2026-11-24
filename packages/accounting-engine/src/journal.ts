import { Decimal, MoneyInput, dec, roundMoney, sum } from './money';

export interface JournalLineInput {
  accountId: string;
  debit: MoneyInput;
  credit: MoneyInput;
  description?: string;
}

export class UnbalancedEntryError extends Error {
  constructor(public readonly totalDebit: string, public readonly totalCredit: string) {
    super(`Journal entry is not balanced: debit=${totalDebit} credit=${totalCredit}`);
    this.name = 'UnbalancedEntryError';
  }
}

export class InvalidLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLineError';
  }
}

export interface ValidatedJournal {
  lines: { accountId: string; debit: Decimal; credit: Decimal; description?: string }[];
  totalDebit: Decimal;
  totalCredit: Decimal;
}

/**
 * Single source of truth for journal validation. Every posting path
 * (manual, automatic, reversal) must go through this function.
 */
export function validateJournal(lines: JournalLineInput[]): ValidatedJournal {
  if (lines.length < 2) {
    throw new InvalidLineError('A journal entry needs at least two lines');
  }

  const normalized = lines.map((l, i) => {
    const debit = roundMoney(l.debit);
    const credit = roundMoney(l.credit);
    if (debit.isNegative() || credit.isNegative()) {
      throw new InvalidLineError(`Line ${i + 1}: amounts cannot be negative`);
    }
    if (debit.gt(0) === credit.gt(0)) {
      throw new InvalidLineError(`Line ${i + 1}: exactly one of debit/credit must be greater than zero`);
    }
    return { accountId: l.accountId, debit, credit, description: l.description };
  });

  const totalDebit = sum(normalized.map((l) => l.debit));
  const totalCredit = sum(normalized.map((l) => l.credit));
  if (!totalDebit.eq(totalCredit)) {
    throw new UnbalancedEntryError(totalDebit.toFixed(2), totalCredit.toFixed(2));
  }
  return { lines: normalized, totalDebit, totalCredit };
}

/** Builds the lines of a reversing entry (swap debit and credit). */
export function reverseLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: dec(l.credit),
    credit: dec(l.debit),
    description: l.description,
  }));
}
