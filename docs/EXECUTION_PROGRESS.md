# Execution progress

Resume by reading this file and `git status`. Do not redo finished work.

## Current phase
Phases A (discovery), E (mobile database/offline), F (sync) and G (mobile screens) largely done on the mobile side.
Phases B, C, D, H, I, J, K are mostly open because they need a runnable API + PostgreSQL (BLOCKED in the session sandbox).

## Done (branch `claude/master-audit-and-hardening`)
See `MASTER_AUDIT_REPORT.md` (items 1-13) and `git log 72d27f1..HEAD`.

## Files
48 changed (24 added, 24 modified) in `apps/mobile`, `apps/api/src/common`, `apps/api/src/modules/auth`, `docs`,
`package-lock.json`.

## Tests
Mobile 60 PASS, API guard specs 8 PASS, accounting-engine 6 PASS, web typecheck PASS. API/DB suites BLOCKED here.

## Next steps (in order)
1. Run CI on the branch (PostgreSQL). Fix anything it reports.
2. DONE: finding A (purchase-cancel costing) fixed with database test; incremental catalogue sync done; representative data isolation done (PR #28).
3. Test the mobile app on a real Android device: login, offline sale, kill app mid-save, sync, camera, PDF, RTL.
4. Incremental sync (server `since` cursor + mobile) and CONFLICT handling.
5. Audit accounting posting, treasury, payroll, VAT and the new branch scoping.
6. Push notifications (needs credentials), performance volume tests, E2E scenarios.

## Engineering decisions
- App id changed to `com.erpfield.app` because the app was never published (owner confirmed). Replace with the
  company's own reverse-domain id before the first store release; it cannot change afterwards.
- HTTP allowed only in development/preview builds (`app.config.js`); production is HTTPS-only.
- Permissions guard is deny-by-default; new routes must declare `@RequirePermissions`, `@Public` or `@AnyAuthenticated`.
- No accounting or costing rule was changed without database tests.
