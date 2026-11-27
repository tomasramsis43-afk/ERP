# Status and remaining gaps

Compared with the master specification. "Missing" means no schema/API for it exists in the repository.

## Added in recent passes
- Inventory valuation report (quantity x weighted-average cost per warehouse/product) reconciled against the INVENTORY and VEHICLE_STOCK ledger accounts: `GET /reports/inventory/valuation`.
- Low-stock report against `reorderLevel`: `GET /reports/inventory/low-stock`.
- Slow-moving report: `GET /reports/inventory/slow-moving?days=90`.
- Web: Reports > Inventory tab, Commission rules page, working export-language selector.
- Sales orders, purchase orders, quotations: API + web (migrations 0004, 0005).
- Stock count sessions (jard): API + web (migration 0003).
- Route visit log: API + web (migration 0002).
- Year-end closing entries: API `/accounting/year-end/:periodId/(preview|close)` and web page.
- Cash-box day closing and physical-cash reconciliation (migration 0006).
- Credit-limit override with recorded approval (migration 0007).
- Product min/max levels (migration 0008).
- Discount approval: `sales:approve_discount` permission; discounts above 5% require approval.
- Account lockout after 5 failed login attempts (15 min).
- Seed always syncs access control so new permissions reach existing deployments.
- Manual journal lines support `partyType`/`partyId` (opening balances for customers/suppliers).
- VAT declaration report: `GET /reports/vat?from=&to=`.

## Missing or partial
| Area | State |
|---|---|
| FIFO valuation | Missing (weighted average only; no company setting) |
| Expiry dates / batches | Missing |
| Negative-stock override | Missing (hard blocks only) |
| Opening balances workflow | Partial (manual journals + tagged party lines supported; dedicated UI pending) |
| Recurring journal entries | Missing |
| Branch (multi-branch) | Missing (no Branch model) |
| Arabic PDF export | Not supported (Excel works; English PDF works) |
| Redis-backed throttling | Not implemented |
| Mobile: returns, day closing, day summary, receipts, van stock view | Screens exist (type-checked, not run on a device) |
| Web: customer/supplier/representative detail screens for custody and visits | Partial |
| Mobile real-device test pass | Not done |
| Web not exercised in a browser for document creation | Partially done (dialogs exist) |

## Verification limits
Type-checks pass for API and web; unit tests pass for the accounting engine (6), web helpers (6) and mobile (46). The database test suites run in CI (PostgreSQL 16).