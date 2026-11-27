# Status and remaining gaps

Compared with the master specification. "Missing" means no schema/API for it exists in the repository.

## Delivered in recent passes
- Inventory valuation report (quantity x weighted-average cost per warehouse/product) reconciled against the INVENTORY and VEHICLE_STOCK ledger accounts: `GET /reports/inventory/valuation`.
- FIFO valuation via the `inventory.valuationMethod` setting, plus weighted average; valuation report shows the applied cost.
- Stock layers with batch numbers and expiry dates, FEFO consumption, and `GET /inventory/batches`.
- Approved negative-stock sales via `inventory:override_negative`, a recorded `negativeStockReason`, and audit logging.
- Opening balances through balanced, idempotent, party-tagged journals: `POST /accounting/opening-balances`.
- Recurring journal entries (API + web screen).
- Branch model with audited CRUD, user/warehouse assignment, and branch-scoped visibility (`SYSTEM_ADMIN`/`GENERAL_MANAGER` remain system-wide).
- VAT declaration report: `GET /reports/vat?from=&to=`.
- Discount approval: `sales:approve_discount` permission; the threshold is configurable via `sales.discountApprovalThreshold`.
- Persistent failed-login lockout after 5 attempts for 15 minutes (`LoginAttempt` table, survives restarts).
- Shared Redis-backed throttling when `REDIS_URL` is set; local in-memory fallback and `THROTTLE_TTL`/`THROTTLE_LIMIT` overrides.
- Manual journal lines support `partyType`/`partyId` (opening balances for customers/suppliers).
- Mobile: offline banner driven by NetInfo, plus existing sale/return/collection, van stock, day summary, and day-closing screens with offline outbox. The manual Android build workflow generates the APK with Gradle (no Expo token needed) and publishes it to the `v0.1.0-mobile-apk` GitHub release automatically.
- Web: customer and representative detail screens now include route-visit history; representative details also show custody, vehicle stock, closings, and commissions.
- Seed always syncs access control so new permissions reach existing deployments.
- Cash-box day closing and physical-cash reconciliation.
- Credit-limit override with recorded approval, product min/max levels, stock count sessions, route visit log, sales/purchase orders and quotations.

## Known limitations
| Area | State |
|---|---|
| Arabic PDF export | Not supported (Excel works; English PDF works) |
| Mobile: dedicated receipt detail/print screen | Partial (receipts are generated and shared from Day Summary) |
| Mobile real-device test pass | Not done |
| Web URL-addressable detail pages | Partial (customer/supplier/representative `?id=` links now open details; products still use a custom page) |
| Web document creation exercised in a browser | Partially done (dialogs exist) |
| Redis deployment | Optional; shared throttling requires `REDIS_URL` to be configured |

## Verification limits
Type-checks pass for API and web; unit tests pass for the accounting engine, web helpers, API guards/auth/throttler, and mobile. Database-backed end-to-end suites run in CI (PostgreSQL 16). The live deployment has been exercised through the API for posting, valuation, VAT, discount approval, and cash-box validation; a full browser and physical-device pass is still outstanding.
