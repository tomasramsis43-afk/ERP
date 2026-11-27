# Master audit report (session of 2026-11-27)

Status legend: PASS / FAIL / BLOCKED / NOT TESTED. Scope this session: repository discovery and the mobile app.
The API, database and web were **read, not changed or executed** (see Blocked).

## Verified in this environment
| Check | Result |
|---|---|
| shared-types, accounting-engine build | PASS |
| accounting-engine unit tests (6) | PASS |
| mobile typecheck | PASS |
| mobile unit tests | PASS (35; was 24) |
| web typecheck | PASS |
| API typecheck | BLOCKED: `prisma generate` cannot download its engine (proxy 403) |
| API / database test suites | BLOCKED: no Docker daemon, no Prisma engine; they run in CI (PostgreSQL 16) |
| Android / iOS build | NOT TESTED |
| Real device / emulator | NOT TESTED |

## Findings fixed (branch `claude/master-audit-and-hardening`)
1. Device id was the constant `device-local` for every install -> persisted random UUID per install.
2. Sale/return/collection saved outbox, receipt and van stock in separate writes -> one SQLite transaction.
3. No guard against a double tap on Save -> guarded; a failed save shows an error and records nothing.
4. API client had no timeout/cancel, parallel 401s could reuse a rotated refresh token, a gateway HTML error crashed
   the JSON parser, and network loss could be treated as a lost session -> fixed (details in the commit).

## Findings open (not fixed)
- `android.usesCleartextTraffic: true` and `http://` server addresses are accepted. Left as is: the app is designed for
  LAN servers typed by the user. Decision needed: allow HTTP only in preview builds.
- Application id `com.example.erpfield` (Android and iOS). Changing a published id breaks updates; confirm whether a
  build was ever published before changing.
- Sale/return screens render the product picker with `map` inside a `ScrollView` (not virtualized); breaks down with
  thousands of products.
- Mobile pull is a full snapshot (no incremental sync); sync has no backoff and no CONFLICT/SYNCING states.
- Eight horizontally scrolling tabs; no barcode scanner, push notifications, PDF/print.
- SQLite has no schema versioning (`CREATE TABLE IF NOT EXISTS` only), no integrity check, no foreign keys.
- Documentation drifts from code: `docs/STATUS_AND_GAPS.md` lists return/close-day/van-stock/receipt screens as missing,
  but the screens exist.
- Known from README: no Arabic PDF, FIFO, batches/expiry, multi-branch, Redis-backed throttling.

## Not audited yet
Accounting engine integration, inventory, NestJS endpoints (RBAC, IDOR, company isolation), Prisma schema, web
screens, CI workflows, performance volumes. They need a working Prisma engine and PostgreSQL to verify.
