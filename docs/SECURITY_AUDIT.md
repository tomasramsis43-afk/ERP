# Security audit (partial)

Method legend: STATIC = code read, not executed. TESTED = automated test ran.

| Item | Result |
|---|---|
| Authorization is enforced on the server | STATIC: global JWT + permission guards; every route except auth/health has a rule |
| Fail-open guard | FIXED + TESTED: deny-by-default, `route-access.spec.ts` fails CI on any route without a rule |
| SQL injection | STATIC: raw SQL only via tagged templates |
| Rate limiting | Main now adds Redis-backed throttling and a persistent login lockout (specs ran: throttler PASS; auth.service spec BLOCKED here). Not otherwise audited |
| Secrets | STATIC: env required and rejects `CHANGE_ME*`; `.env` not committed. Git history not scanned |
| CORS / headers | STATIC: helmet; CORS closed unless `CORS_ORIGINS` is set |
| Mobile token storage | SecureStore (not AsyncStorage). STATIC |
| Cleartext traffic | FIXED: production builds HTTPS-only; stored http address ignored in production |
| Device id | Label only, never authentication. TESTED (uuid) |
| Representative data isolation (IDOR) | FIXED + TESTED in CI: a REPRESENTATIVE-role user without `representatives:approve` sees only their own invoices, customers (own/route), van stock, profile, closings and commissions; cannot sell from the main warehouse or for another rep; a replayed foreign idempotency key is refused (`common/rep-scope.ts`, `test/rep-scope.e2e.spec.ts`). Found by static audit: REST reads were unscoped |
| Branch isolation (`branchScope`), accounting/treasury/payroll/VAT authorization | NOT AUDITED |
| Refresh-token rotation internals | NOT AUDITED |
| File uploads, XSS/CSRF on web | NOT AUDITED |
| Dependency vulnerabilities | NOT RUN |
