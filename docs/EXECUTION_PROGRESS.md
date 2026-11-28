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
2. Decide and fix finding A (purchase-cancel costing) with a database test.
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


## Mobile redesign (branch `feat/mobile-redesign`)
Built on the current main (which already had device id, atomic save, row-level outbox results, barcode, PDF receipts, catalogue delta).
- Shell: 4 tabs (Today, Customers, Products, More) with icons; every other screen opens as a full-screen flow with a back button (hardware back supported); offline pill with the number of waiting operations; dark/light palette.
- Today: sales, collections, returns, visits done/total, pending count, quick actions, next visits (biggest debtors not yet visited).
- Sale in 3 steps (customer, items with +/- steppers and scan, confirm with cash/credit), credit-limit warning (the server stays the authority), low-stock marker (van stock <= 5), receipt share after saving.
- Customer card: balance with limit bar, call, WhatsApp (local numbers read as Egypt +20), log visit (VISIT operation), recent activity from local receipts, online statement.
- Products: search, scan, running-low filter, prices and units.
- New operations from the phone: EXPENSE (reduces expected cash in the day summary), VISIT, CUSTOMER (appears after the next sync).
- Not done: map of customers (needs a maps dependency and customer coordinates, which the data does not have), Arabic web font in receipts (the platform renderer shapes Arabic), real-device test.
