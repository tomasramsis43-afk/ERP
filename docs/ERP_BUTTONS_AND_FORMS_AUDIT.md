# ERP buttons, forms and coverage audit

Scope and method: static review of the repository (Prisma schema, NestJS controllers, Next.js pages and
shared components). Nothing here was exercised in a browser or on a device; items marked **unverified**
need a manual pass. API behaviour is covered by the e2e suites in `apps/api/test`.

## 1. Web app: which pages write data

| Page | Writes (from code) | Notes |
|---|---|---|
| Accounts | create, edit | tree CRUD, deactivate instead of delete |
| Journal | create, post, reverse | posted entries are corrected by reversal |
| Sales / Purchases (`InvoicePage`) | create invoice, cancel | returns share the same page |
| Customers / Suppliers (`PartyPage`) | create, edit, statement, aging | |
| Products (`products`) | create, edit | units and prices |
| Inventory | opening stock, transfers, adjustments (one `post` per mode) | |
| Warehouses / Catalog / Geo (`ResourcePage`) | create, edit | generic resource editor |
| Treasury | vouchers, cancel, cheques (incoming, outgoing, settle, bounce), bank reconcile | |
| Representatives | create, close day, pay commission | |
| Vehicles | create, add expense | |
| Routes | create, assign customers | |
| HR | attendance, leave decide, advances, payroll run and pay | |
| Admin | users, roles, status | |
| Reports | read + Excel export | |

Pages with no write path by design: dashboard, ledger.

## 2. Backend features with no web UI yet

| Feature | API | Web |
|---|---|---|
| Quotations, sales orders | `/sales-orders` (this change) | none |
| Purchase orders | `/purchase-orders` (this change) | none |
| Per-product price lists / customer special prices | `/customers`, `/products` | verify in products page (**unverified**) |
| Vehicle expense report per vehicle/route profitability | expenses stored, no report | none |

## 3. Gaps found against the requirements (not implemented yet)

| Requirement | State |
|---|---|
| Purchase request, goods receipt as a separate step | missing. Purchase order converts directly to the purchase invoice (stock is received once, on conversion) |
| Stocktake (جرد) document with counted vs system quantity and approval | missing. Only direct adjustments exist (`/inventory/adjustments`) |
| FIFO valuation and a company-level valuation setting | missing. Weighted average only |
| Product expiry dates and expiry alerts | missing |
| Visit log for representatives (visited / not visited) | missing |
| Vehicle and route profitability reports | missing |
| Redis-backed throttling and sessions | provisioned, unused |
| Arabic PDF export | not supported (library limitation); Excel works |
| Mobile screens on a real device, web app in a real browser | **unverified** |

## 4. Added in this change

- Tables `SalesOrder`, `SalesOrderLine`, `PurchaseOrder`, `PurchaseOrderLine` (migration `0002_orders`, additive).
- `POST /sales-orders` (kind `QUOTE` or `ORDER`), `/:id/confirm`, `/:id/convert`, `/:id/cancel`, list and get.
- `POST /purchase-orders`, `/:id/confirm`, `/:id/convert`, `/:id/cancel`, list and get.
- These documents never move stock or post to the ledger. Conversion calls the existing invoice services, so credit limit,
  stock availability, price/discount permissions, costing and journal entries are applied there, and the invoice idempotency
  key is derived from the document id so a retry cannot create a second invoice.
- Permissions reuse existing codes: `sales:view|create|approve|cancel`, `purchases:view|create|approve|cancel`.
- Tests: `apps/api/test/orders.e2e.spec.ts`.

## 5. Suggested next steps (in order)

1. Web screens for quotations, sales orders and purchase orders.
2. Stocktake document and its approval flow.
3. Representative visit log.
4. Vehicle/route profitability report.
5. FIFO valuation setting (needs an accounting decision on switching methods).
