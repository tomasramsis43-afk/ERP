# Execution progress — review of 2026-11-28

Branch: `audit/mobile-hardening` (from `main` @ 35156d1). Nothing merged, nothing deployed.

## Verification results (this session)
| Check | Result |
|---|---|
| `npm ci` | PASS |
| typecheck: mobile, web, accounting-engine, shared-types | PASS |
| typecheck: API | BLOCKED — Prisma engine download is refused by the sandbox proxy, so the client cannot be generated (the errors are all missing Prisma types, not code defects). Runs in CI. |
| unit tests: mobile (33), web (9), accounting-engine (6) | PASS |
| API unit + 27 e2e suites | BLOCKED (need Prisma engine + PostgreSQL). Not re-run here; CI is the evidence. |
| Android / iOS build | NOT TESTED |
| Real device / browser pass | NOT TESTED |
| `lint` | Is `tsc --noEmit` in every workspace; there is no ESLint. |

## Done on main (verified present in code)
Accounting engine, inventory (multi-warehouse, FIFO/weighted average, batches/expiry/FEFO, stock counts, negative-stock override), sales/purchases + orders/quotations, treasury, representatives/custody/day closing with difference reason, HR/payroll, reports (Excel, English PDF), idempotent sync API, RBAC, audit log, branches, login lockout, Redis-backed throttling when configured, web admin screens, CI with PostgreSQL, backup/restore scripts.
Mobile: offline outbox, snapshot sync, sale / return / collection / van stock / day closing / day summary screens, receipts, offline banner, Arabic/English.

## Done in this branch
1. Device identity: constant `'device-local'` replaced by a per-install UUID kept in SecureStore (`getDeviceId`).
2. Atomic local save: sale/return/collection now write outbox + receipt + van stock in one SQLite transaction (`saveOperation`); before, a crash between the three writes could queue a sale without decrementing van stock.
3. Double-tap guard on the three save actions.
4. SQLite schema versioning via `PRAGMA user_version` (append-only steps), `foreign_keys` on, index on outbox status.
5. API client: 30 s timeout via AbortController, `NetworkError` classification, safe JSON parsing, single shared refresh request, `SessionExpiredError`, dead tokens removed only when refresh is refused (outbox untouched).
6. Tests: +9 mobile tests (client, migrations, device id). Mobile total 33 PASS.

## Still open (from the specification)
**Mobile**
- Incremental sync (pull is a full snapshot); cursor pagination; exponential backoff; background sync; sync history; conflict states (outbox only knows PENDING/REJECTED, not the six states requested).
- Reads still use ScrollView around lists in App/Sync/Sale/Return/CloseDay (FlatList is used for the product/customer pickers).
- UI does not yet react to `SessionExpiredError` by returning to login (the sync report shows the error only).
- Barcode scanner, push notifications, Arabic PDF/print, price lists/discounts/taxes on the sale screen, original-invoice selection on returns, bottom navigation redesign, dark-mode toggle review, accessibility pass.
- Release config: `com.example.erpfield` is still the application id and `usesCleartextTraffic: true` is enabled. Not changed: it depends on whether an APK has been distributed (changing the id breaks updates), and the production URL is already HTTPS. Needs your decision.
**Backend / docs**
- API typecheck and e2e not re-run (blocked). Migration folder numbering has two `0002_*` and no `0009` — harmless to Prisma if already applied, but confirm against production `_prisma_migrations` before touching.
- Arabic PDF export; web e2e (Playwright); web document creation not exercised in a browser; performance targets (10k products, 100k journal lines…) have only the existing `performance.e2e.spec.ts`.
- Requested docs not yet written: MASTER_AUDIT_REPORT, PROJECT_ARCHITECTURE, IMPLEMENTATION_ROADMAP, MOBILE_AUDIT, MOBILE_OFFLINE_SYNC, ACCOUNTING_AUDIT, INVENTORY_AUDIT, SECURITY_AUDIT, PERFORMANCE_REPORT, TEST_RESULTS, DEPLOYMENT_GUIDE, KNOWN_LIMITATIONS (partly covered by `README.md` and `docs/STATUS_AND_GAPS.md`).

## Next step
Mobile Phase F: incremental sync (needs a server-side `since` cursor on `/sync/pull`), the six operation states, backoff.
Note: `docs/ERP_AUDIT_STATUS.md` is outdated — it lists orders, stock counts, FIFO, batches, route visits as missing; all exist in code now.
