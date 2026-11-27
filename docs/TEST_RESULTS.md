# Test results (session run)

| Suite | Result | Count |
|---|---|---|
| @erp/accounting-engine | PASS | 6 |
| @erp/mobile (jest) | PASS | 60 in 13 suites |
| @erp/api guards (`src/common/guards`) | PASS | 8 |
| @erp/web typecheck | PASS | - |
| @erp/mobile typecheck | PASS | - |
| @erp/api typecheck | BLOCKED | Prisma engine download refused |
| @erp/api database suites | BLOCKED | no Prisma engine / Docker |
| E2E, performance, security scans | NOT TESTED | - |
| Android/iOS build, device | NOT TESTED | - |

Mobile tests cover: cart/money, receipts, receipt HTML escaping, server URL policy, device id, HTTP helpers (timeout,
cancel, single-flight), search, barcode lookup, migrations, serial queue, backoff, operation states and the sync engine
(including the two race conditions). Screens and SQLite calls are not unit-tested (they need a device).
