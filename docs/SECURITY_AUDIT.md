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
| IDOR, branch isolation (`branchScope` from main), user-data isolation | NOT AUDITED |
| Refresh-token rotation internals | NOT AUDITED |
| File uploads, XSS/CSRF on web | NOT AUDITED |
| Dependency vulnerabilities | NOT RUN |
