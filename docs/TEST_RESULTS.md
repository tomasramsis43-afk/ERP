# Test results (session run, 2026-11-28)

| Suite | Result | Count |
|---|---|---|
| @erp/accounting-engine | PASS | 6 |
| @erp/shared-types build | PASS | - |
| @erp/accounting-engine build | PASS | - |
| @erp/mobile (jest) | PASS | 69 in 14 suites |
| @erp/web typecheck | PASS | - |
| @erp/mobile typecheck | PASS | - |
| @erp/api typecheck | PASS | - |
| @erp/api database suites | PASS (local PG 16) | 186 passed, 1 failed (performance hook timeout) |
| @erp/api guard + route-coverage + throttler | PASS | 10 |
| Security E2E | PASS | (included in API suites) |
| Performance E2E | FAIL (local hook timeout) | 1 failed |
| Android/iOS build, device | NOT TESTED | - |

Mobile tests cover: cart/money, receipts, receipt HTML escaping, server URL policy, device id, HTTP helpers (timeout,
cancel, single-flight), search, barcode lookup, migrations, serial queue, backoff, operation states and the sync engine
(including the two race conditions). Screens and SQLite calls are not unit-tested (they need a device).
