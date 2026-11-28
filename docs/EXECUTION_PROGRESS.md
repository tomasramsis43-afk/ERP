# Execution progress

## Done (branch `fix/mobile-sync-integrity`)
- Phase A (partial): mobile source read; findings in `docs/MOBILE_AUDIT.md`. API, web, Prisma schema and accounting were NOT audited.
- Phase B/E/F (partial): findings 1, 2, 3, 4, 6, 7 of the mobile audit.
- CI: branch builds upload the APK as a workflow artifact; only `main` replaces the release.
- Tests: `npm test --workspace @erp/mobile` -> 35 passed; `tsc --noEmit` clean.

- Incremental pull: API `?since=` + mobile merge, 35 mobile tests, API e2e added (verified by CI only).
- API: sales invoices scoped to the caller branch (list/get/create), e2e `branch-sales-scope`.

## Not done
Branch scoping of vouchers/cash boxes (no branch link in the schema), operation status model beyond PENDING/REJECTED, backend/DB/security audit, web UI audit, performance tests, Arabic PDF, real-device testing, production signing, application id.

## Next
1. Verify the APK artifact on a device. 2. Operation status screen (SERVER_ACCEPTED/CONFLICT). 3. Branch link for cash boxes/vouchers (schema decision).
