# ERP buttons and forms audit

Method: static trace of every web page and shared component to the API endpoint it calls (`apps/web` -> `apps/api`), plus type-checks. **Nothing here was exercised in a browser or against a live database**; "Wired" means the call exists and matches a real endpoint, not that it was clicked through.

## Page by page

| Page | Actions found | Endpoint | Status |
|---|---|---|---|
| Accounts | create, edit | `accounting/accounts` | Wired |
| Journal | create, post, reverse | `accounting/journal-entries` | Wired |
| Ledger | view / filter | `accounting/reports/ledger` | Wired (read only) |
| Products | create, edit, customer prices | `products`, `products/:id/customer-prices` | Wired |
| Catalog | units, categories | `units`, `product-categories` | Wired |
| Warehouses | create, edit | `warehouses` | Wired |
| Inventory | transfer, opening stock, adjustment | `inventory/*` | Wired |
| Sales / Purchases | invoice, return, cancel | `sales/*`, `purchases/*` (InvoicePage) | Wired |
| Customers / Suppliers | create, edit, statement, aging | `customers`, `suppliers` (PartyPage) | Wired |
| Treasury | accounts, vouchers, cancel, cheques (settle/bounce), reconciliation | `financial-accounts`, `treasury/*`, `banks/*` | Wired |
| Representatives | create, edit, closing preview, close day, pay commissions | `representatives/*` | Wired |
| **Commission rules** | list, create, deactivate | `representatives/commission-rules` | **Was missing - added** |
| Vehicles | create, edit, expenses | `vehicles/*` | Wired |
| Routes | areas, routes, assign customers | `geo-areas`, `routes/*` | Wired |
| HR | attendance, leave (request/decide), advances, payroll (run/pay) | `hr/*` | Wired |
| Admin | users, roles, settings, fiscal periods, audit log | `users`, `roles`, `settings`, `fiscal-periods`, `audit-logs` | Wired |
| Reports | statements, aging, profitability, export | `reports/*` | Wired |
| **Reports - Inventory** | valuation (with GL comparison), low stock, slow-moving | `reports/inventory/*` | **Was missing - added** |

## Defects found and fixed

1. Reports > Export: the **Language** selector had an empty `onChange` and could never change. It now sets the export language; PDF is forced to English (the PDF library cannot shape Arabic) and the UI says so.
2. No screen for commission rules although the API and the commission engine use them. Added `/commission-rules`.
3. No inventory reports in the UI or API beyond the dashboard's low-stock counter. Added valuation, low stock and slow-moving.

## Known gaps (not done)

See `docs/STATUS_AND_GAPS.md`.

## Forms: what was checked

All create/edit forms go through `ResourcePage` or a modal with `required` inputs, and the API validates with `class-validator` DTOs (regex on money/quantity, UUID, enums). The new commission form mirrors the DTO (rate pattern, no product on collection-based rules).
