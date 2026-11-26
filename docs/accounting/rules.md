# Accounting rules implemented

1. **Balanced journals only.** A journal entry needs at least two lines and equal total debit and credit; each line has exactly one non-zero side. Enforced in the accounting engine and again by database constraints.
2. **Posted entries are immutable.** Update/delete triggers reject changes to posted entries and their lines. A correction is a new entry that reverses the original (`reversesId` is unique, so an entry can be reversed once). Cancelling a sales or purchase document posts reversals and reverses its stock movements.
3. **Idempotent posting.** Every automatic posting has a deterministic idempotency key; replays and concurrent duplicates return the first result.
4. **Statements come from posted journals only**, never from invoices: trial balance, income statement, balance sheet (equity includes cumulative profit), cash flow (direct method over cash boxes, banks and representative custody), aging (FIFO settlement per party).
5. **Control accounts equal sub-ledgers.** Receivables = sum of customer balances; payables = sum of supplier balances; inventory value = inventory accounts. Checked by the full-cycle test.

## Automatic postings
| Event | Debit | Credit |
|---|---|---|
| Cash sale | Cash box (or the representative's custody) | Sales (+ VAT payable) |
| Credit sale | Receivables (customer) | Sales (+ VAT payable) |
| Sale cost | COGS | Inventory (or vehicle stock) |
| Sales return (good) | Sales returns, then Inventory at original cost | Cash/Receivables, COGS |
| Damaged return | Sales returns (cost stays in COGS) | Cash/Receivables |
| Purchase | Inventory (+ landed cost, VAT receivable) | Payables / cash |
| Receipt / payment voucher | Cash box or bank / counter account | counter account / cash box or bank |
| Cheque steps | One journal per status change | |
| Loading a vehicle | Vehicle stock | Inventory (a transfer, never a sale) |
| Daily closing | Main cash box, custody difference | Custody cash (and stock difference to vehicle stock) |
| Commission accrual / payout | Commission expense / accrued liabilities | Accrued liabilities / cash |
| Payroll | Salaries expense | Employee advances (recovered), accrued liabilities (net) |
| Employee advance | Employee advances | Cash box or bank |

## Inventory
Weighted-average cost; quantity never below zero (guarded decrement plus a CHECK constraint); movements are append-only (trigger); row locks are taken in a global order to avoid deadlocks.
