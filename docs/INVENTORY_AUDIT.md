# Inventory audit (static only)

Reviewed `modules/inventory/stock.service.ts` and its 11 call sites (re-checked finding A after merging main 35156d1). Nothing executed.

PASS (by reading)
- Single writer of `StockBalance`/`StockMovement`; guarded `UPDATE ... quantity >= qty` prevents negative stock unless the actor holds `inventory:override_negative` with a recorded reason (added on main).
- Idempotency key prevents a movement twice; average cost updated under a `Product` row lock.
- Lock order is consistent: every caller of `apply` calls `lockBalances` first (balances sorted, then product).
- FEFO layer consumption is best-effort for legacy stock.

OPEN (finding A, needs DB test + accounting decision)
- Purchase cancellation: stock leaves at current average cost; the journal reversal mirrors the original cost; the average
  is not recomputed. Stock valuation and the INVENTORY ledger account can diverge (example in `MASTER_AUDIT_REPORT.md`).
  Suggested fix: on purchase cancel, recompute average as `(onHand*avg - qty*originalCost) / (onHand - qty)` when stock
  remains, and test it against the valuation-vs-ledger reconciliation report.

NOT REVIEWED: stock counts, transfers, closing differences, batch/expiry, valuation report SQL.
