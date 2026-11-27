# Status and remaining gaps

Compared with the master specification. "Missing" means no schema/API for it exists in the repository.

## Added in this pass
- Inventory valuation report (quantity x weighted-average cost per warehouse/product) reconciled against the INVENTORY and VEHICLE_STOCK ledger accounts: `GET /reports/inventory/valuation`.
- Low-stock report against `reorderLevel`: `GET /reports/inventory/low-stock`.
- Slow-moving report: `GET /reports/inventory/slow-moving?days=90`.
- Web: Reports > Inventory tab, Commission rules page, working export-language selector.

## Missing or partial
| Area | State |
|---|---|
| Quotations, sales orders | Missing |
| Purchase requests, purchase orders, goods receipt | Missing (invoices only) |
| Stock count sessions (jard) | Missing (adjustments exist, no count/approval workflow) |
| FIFO valuation | Missing (weighted average only; no company setting) |
| Expiry dates / batches | Missing |
| Product min/max levels | Only `reorderLevel` |
| Route visit log (visited / not visited) | Missing |
| Opening / closing (year-end) entries as a workflow | Missing (manual journals only) |
| Cash-box day closing and physical-cash reconciliation | Partial (bank reconciliation and rep day closing exist) |
| Credit-limit override with recorded approval; negative-stock override | Missing (hard blocks only) |
| Mobile: returns, day closing, day summary, receipts, van stock view | Missing screens (sale, collection, customers, sync exist) |
| Web: customer/supplier/representative detail screens for custody and visits | Partial |
| Redis-backed throttling | Not implemented |
| Arabic PDF export | Not supported (Excel works) |

## Verification limits of this pass
Type-checks pass for API and web; unit tests pass for the accounting engine (6), web helpers (6) and mobile (20). The database test suites were **not run**: the sandbox could not download Prisma's query engine. They run in CI.
