# Master audit report

Work date: 2026-11-27/28. Branch: `claude/master-audit-and-hardening` (merged with `main` 35156d1 on 2026-11-28; main had meanwhile added branches, FIFO valuation reporting, negative-stock gate, persistent lockout and Redis throttling).
Status legend: PASS / FAIL / BLOCKED / NOT TESTED. Nothing below is claimed beyond what was actually run.

## Scope actually covered
| Area | Depth |
|---|---|
| Mobile app (`apps/mobile`) | Read in full, fixed, unit-tested, type-checked. Not run on a device or emulator |
| API (`apps/api`) | Read selectively (guards, bootstrap, sync, stock, purchase cancel). One change (deny-by-default guard), tested without a database |
| Database / Prisma schema / migrations | Only grepped (idempotency keys). Not audited, not executed |
| Accounting engine package | Tests re-run (6 PASS). Journal/posting services not audited |
| Web (`apps/web`) | Type-check only (PASS). Not audited |
| CI, Docker, release | Mobile config reviewed and changed; workflows read, not changed |

## Verification results
| Check | Result |
|---|---|
| shared-types and accounting-engine build | PASS |
| accounting-engine unit tests | PASS (6) |
| mobile typecheck | PASS |
| mobile unit tests | PASS (60 tests, 13 suites; was 24) |
| web typecheck | PASS |
| API guard + route-coverage + throttler specs (no DB needed), after merging main | PASS (10) |
| API full typecheck | BLOCKED: `prisma generate` cannot download its engine here (proxy 403) |
| API / database test suites | BLOCKED: no Prisma engine, no Docker daemon. They run in CI on PostgreSQL 16 |
| Android build / iOS build | NOT TESTED (needs EAS) |
| Real device or emulator (camera, SQLite, PDF, RTL, sync) | NOT TESTED |
| Performance volumes (10k products etc.) | NOT TESTED |
| E2E scenarios | NOT TESTED |

## Fixed (each with tests where logic is testable)
Mobile
1. Constant device id `device-local` -> persisted random UUID per installation.
2. Sale/return/collection saved in 3 separate writes -> one SQLite transaction; double-tap guard; failed save records nothing.
3. **Data loss race**: whole-queue rewrite after a sync deleted sales saved during the sync; the post-sync snapshot could
   overwrite local stock. Replaced by per-operation `applyResults` and a snapshot write that checks "nothing pending"
   inside the same transaction. All writes serialized through one queue.
4. API client: timeout + cancellation, one shared token refresh, safe JSON, session ends only on explicit 401/403,
   login screen on expiry (outbox untouched).
5. SQLite schema versioning (`PRAGMA user_version`), startup integrity check that only warns.
6. Virtualized product picker with Arabic/English/code search.
7. Automatic sync on reconnect (single run, exponential backoff 5 s..5 min).
8. Barcode scanner (product and pack-unit barcodes; `unitId` now sent to the server).
9. PDF receipts and day summary (RTL/LTR, escaped, offline).
10. Per-operation states, confirmation before discarding a rejected operation, 4 tabs + More navigation.
11. Release config: HTTPS-only production builds, new application id `com.erpfield.app` (app was never published).
12. Regression I introduced and fixed: offline message in day closing.

API
13. `PermissionsGuard` was fail-open (a route without a rule was open to every logged-in user). Now deny-by-default with
    explicit `@AnyAuthenticated()`; a spec scans all controllers (mutation-checked).

Docs: `STATUS_AND_GAPS.md` corrected (mobile screens exist).

## Findings not fixed
| # | Finding | Why not fixed |
|---|---|---|
| A | Cancelling a purchase takes stock out at the **current average cost**, while the journal reversal mirrors the original entry at the original cost, and the average is not recomputed. Example: buy 10 @10, buy 10 @20 (avg 15), cancel the first: stock valued 10 x 15 = 150, ledger inventory = 200 - 100 = 100 | Costing rule change needs database tests and an accounting decision. Static reasoning only (not executed) |
| B | Mobile pull is a full snapshot; no incremental sync, no CONFLICT state | Needs server API changes testable only with the database |
| C | Local van stock is an estimate computed from the screen's in-memory copy; it self-corrects when the queue is empty and the next snapshot arrives | By design; documented |
| D | Main now has a Branch model and branch scoping (`branchScope`). Not audited here: IDOR/branch isolation per endpoint | Needs running API |
| E | Push notifications | Needs Expo/FCM credentials and a server endpoint for tokens |
| H | `auth.service.spec` does not compile in this sandbox (Prisma types missing); CI covers it | BLOCKED |
| F | Arabic PDF export of server reports, FIFO, batches/expiry UI | See README known limitations |
| G | Accounting, treasury, HR, payroll, VAT, reports, web screens, Prisma migrations | Not audited (needs a running API) |

## Verified by reading only (static, not executed)
- Every controller route except auth/health carries a permission rule; login is throttled (10/min).
- Raw SQL uses tagged templates (parameterized).
- Sync idempotency: `sync:<opId>` is a unique `idempotencyKey` on the business document, so a concurrent retry
  cannot create it twice.
- Stock: guarded `UPDATE` prevents negative stock unless the actor holds `inventory:override_negative` and gives a reason
  (main's change); all 11 call sites checked before the merge lock `StockBalance` before `apply` (main added no new caller
  that was re-checked).

## Production readiness
**NOT READY.** Blocking items: API tests unverified in this session (run CI on the branch), no device test of the
mobile app, no Android/iOS build, finding A open. See `KNOWN_LIMITATIONS.md` and `IMPLEMENTATION_ROADMAP.md`.
