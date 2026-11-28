# ERP System

ERP for a distribution company: accounting, inventory, sales, purchases, treasury (cash, banks, cheques), representatives and vehicles with cash custody, HR and payroll, reports, an Arabic/English web app, and an offline-capable representative mobile app.
Base currency: **EGP**. UI languages: **Arabic (RTL)** and **English**. VAT is off by default (14% when enabled).

## Status

Everything below is covered by automated tests that run in CI on every push (PostgreSQL 16, real database, no mocks for the data layer).

| Area | Scope | State |
|---|---|---|
| Foundation | Monorepo, Docker, accounting engine (balanced journals, reversal), auth (JWT + rotating refresh), RBAC, append-only audit log | Done, tested |
| Accounting | Chart of accounts, journals (immutable once posted, corrected by reversal), fiscal periods, ledger, trial balance | Done, tested |
| Inventory | Products with unit conversion, multi-warehouse stock, weighted-average cost, no negative stock, transfers | Done, tested |
| Sales / Purchases | Cash and credit invoices, returns (good/damaged), cancellation by reversal, credit limits, landed cost, optional VAT | Done, tested |
| Treasury | Cash boxes, banks, vouchers, cheque lifecycle, bank reconciliation | Done, tested |
| Distribution | Areas, routes, vehicles, representatives, custody, daily closing with stock/cash differences, commissions (no double commission, claw-back) | Done, tested |
| Reports | Income statement, balance sheet, cash flow, aging, dashboard, Excel export, English PDF export | Done, tested |
| HR | Employees, attendance, leave, advances, payroll posted to the ledger | Done, tested |
| Offline sync | Idempotent push/pull API, server-side enforcement, replay safety | Done, tested |
| Mobile (Expo) | Offline outbox in SQLite, snapshot, sync engine, sale/collection screens, Arabic/English | Logic tested (16 unit tests); **screens are type-checked but have not been run on a device** |
| Web (Next.js) | Login (httpOnly cookies), dashboard, lists, reports with export, Arabic/English, light/dark | Builds and type-checks; helpers unit-tested; **not exercised in a browser** |
| Operations | Dockerfiles, production compose, backup/restore/verify scripts, baseline migration, drift check | Docker builds, backup round trip and schema drift are checked in CI |

### Known limitations
- Arabic PDF export is not supported (the PDF library cannot shape Arabic); Arabic reports are exported as Excel. English PDF works.
- The web app is a read/report-oriented admin console: creating and editing documents (invoices, vouchers, etc.) is done through the API (OpenAPI docs at `/api/docs`) for now.
- The mobile app has no push notifications, barcode scanning or printing; it needs a real-device test pass before field use.
- Mobile pull is a full snapshot (no incremental sync); fine for a route's customers and a catalogue, not for very large catalogues.
- Redis is provisioned in the compose files but no code uses it yet (rate limiting and sessions currently use in-process/PostgreSQL storage, so a multi-instance deployment would need Redis-backed throttling).
- No external services are required beyond PostgreSQL. Optional: SMTP/SMS/payment gateways are not integrated.

## Stack
TypeScript, NestJS 10, PostgreSQL 16, Prisma 5, decimal.js, Redis, Next.js 14, Expo SDK 58 (React Native 0.88, React 19). See `docs/architecture/`.

## Quick start (development)
Requirements: Node 20+ (22 recommended), Docker.

```bash
cp .env.example .env                      # replace every CHANGE_ME value
npm install
npm run db:up                             # PostgreSQL + Redis
npm run build --workspace @erp/shared-types --workspace @erp/accounting-engine
cd apps/api
npx prisma generate
npx prisma migrate deploy                 # applies the committed migrations
npm run prisma:seed                       # roles, permissions, EGP, chart of accounts, admin user
npm run start:dev                         # API on :3001, docs at http://localhost:3001/api/docs
```
In another terminal: `npm run dev --workspace @erp/web` (http://localhost:3000, expects the API at `http://localhost:3001/api/v1`; override with `API_URL`).
Mobile: `cd apps/mobile && npx expo start` (the API URL is `expo.extra.apiUrl` in `app.json`; Android emulators reach the host at `10.0.2.2`).

## Production
```bash
cp .env.example .env     # set strong secrets, admin credentials, POSTGRES_* values
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env up -d --build
```
Put a TLS-terminating reverse proxy in front of the web container. The API container applies migrations and seeds reference data on start (idempotent).
Backups: `infrastructure/scripts/backup.sh`, `restore.sh`, `verify-backup.sh` (see `docs/operations/runbook.md`).

## Tests
```bash
npm run typecheck && npm run lint && npm test      # unit tests anywhere
```
API end-to-end suites need a seeded PostgreSQL (`DATABASE_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`); without them they are skipped, and CI always provides them. Suites: database integrity, accounting, inventory, sales/purchases, treasury, representatives, reports, HR, sync, security, full-cycle invariants, performance/concurrency.

## Layout
```
apps/api                      NestJS API (one folder per module: controller, service, dto)
apps/web                      Next.js admin web app
apps/mobile                   Expo representative app (offline first)
packages/accounting-engine    decimal money + journal validation/reversal
packages/shared-types         permission codes and roles
infrastructure                Dockerfiles, production compose, backup scripts
docs                          architecture decisions, accounting rules, operations
.github/workflows             CI
```
