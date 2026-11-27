# Master audit report (session of 2026-11-27)

Status legend: PASS / FAIL / BLOCKED / NOT TESTED. Scope this session: repository discovery and the mobile app.
The API, database and web were **read, not changed or executed** (see Blocked).

## Verified in this environment
| Check | Result |
|---|---|
| shared-types, accounting-engine build | PASS |
| accounting-engine unit tests (6) | PASS |
| mobile typecheck | PASS |
| mobile unit tests | PASS (46; was 24) |
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

5. SQLite had no schema versioning -> `PRAGMA user_version` migrations (step 1 = original schema, step 2 = outbox index);
   startup integrity check warns and never deletes data.
6. Product picker rendered every product with `map` inside a `ScrollView` -> modal `FlatList` with Arabic/English/code
   search (diacritic and alef/ya folding), capped at 100 rows.
7. Sync was manual only -> automatic sync on reconnect, one shared run (no overlapping pushes), exponential backoff
   5s..5min while anything is pending or failing.

## API: static review only (code read, NOT executed: BLOCKED, see above)
- Global guards: throttler, JWT, permissions. Every handler except auth/health carries a permission requirement.
- Raw SQL uses tagged templates (parameterized); no `*Unsafe` calls found.
- helmet, strict ValidationPipe (whitelist + forbidNonWhitelisted), CORS closed by default (empty origin list),
  secrets must be set and not `CHANGE_ME*`.
- Sync idempotency: `sync:<opId>` is a unique `idempotencyKey` on the business document, so concurrent retries of one
  operation cannot create it twice.
- Weakness: `PermissionsGuard` is fail-open (an authenticated route with no permission metadata is allowed). Today no such
  route exists; a new controller that forgets the decorator would be open to every logged-in user. Recommended: deny by
  default with an explicit `@AnyAuthenticated()` marker. Not changed because it cannot be verified without the API tests.
- Not reviewed: company/branch isolation (the schema has no Branch model), IDOR on id-based routes, lockout internals,
  accounting posting, inventory costing, Prisma migrations.

## Findings open (not fixed)
- `android.usesCleartextTraffic: true` and `http://` server addresses are accepted. Left as is: the app is designed for
  LAN servers typed by the user. Decision needed: allow HTTP only in preview builds.
- Application id `com.example.erpfield` (Android and iOS). Changing a published id breaks updates; confirm whether a
  build was ever published before changing.
- Mobile pull is a full snapshot (no incremental sync); no CONFLICT/SYNCING states shown to the rep.
- Eight horizontally scrolling tabs; no barcode scanner, push notifications, PDF/print.
- The customer list (horizontal `FlatList`) and sale cart still render every line; fine for a normal cart size.
- Known from README: no Arabic PDF, FIFO, batches/expiry, multi-branch, Redis-backed throttling.

## Not audited yet
Accounting engine integration, inventory, NestJS endpoints (RBAC, IDOR, company isolation), Prisma schema, web
screens, CI workflows, performance volumes. They need a working Prisma engine and PostgreSQL to verify.
