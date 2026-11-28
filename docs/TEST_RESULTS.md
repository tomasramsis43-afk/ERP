# Test results (session run, 2026-11-28)

| Suite | Result | Count |
|---|---|---|
| @erp/accounting-engine | PASS | 6 |
| @erp/shared-types build | PASS | - |
| @erp/accounting-engine build | PASS | - |
| @erp/mobile (jest) | PASS | 70 in 14 suites |
| @erp/web typecheck | PASS | - |
| @erp/mobile typecheck | PASS | - |
| @erp/api typecheck | PASS | - |
| @erp/api database suites | PASS (local PG 16) | 187 passed, 0 failed (performance suite passes when run isolated) |
| @erp/api guard + route-coverage + throttler | PASS | 10 |
| Security E2E | PASS | (included in API suites) |
| Performance E2E | PASS | 3 (150 concurrent sales, reports, paged lists) |
| Android emulator (real Expo Go run) | PASS | 16 checks below |
| iOS build / device | NOT TESTED | needs macOS, Xcode or EAS |
| @erp/web production build | BLOCKED locally | `@next/swc-win32-x64-msvc.node is not a valid Win32 application` on this Windows host |

Mobile tests cover: cart/money, receipts, receipt HTML escaping, server URL policy, device id, HTTP helpers (timeout,
cancel, single-flight), search, barcode lookup, migrations, serial queue, backoff, operation states and the sync engine
(including the two race conditions).

## Real Android run (Pixel 9 API 37 / Android 17 emulator, Expo Go SDK 52)

Environment: local API `http://localhost:3001/api/v1` with local PostgreSQL, Metro at `http://localhost:8081`,
emulator AVD `Pixel_9_API_37` (Android 17 / API 37), Expo Go `host.exp.exponent` version 2.32.19 (SDK 52).
The login screen's server field was pointed at `http://10.0.2.2:3001/api/v1`; no committed app URL was changed.
Test account: `rep.0b9byq@test.local` / `long-password-123`. The user-supplied email could not be used because the API
requires passwords of at least 10 characters, and the user chose to keep the existing test account.

| Check | Result | Evidence |
|---|---|---|
| Sign in with custom server URL | PASS | App showed the rep's name and customer list |
| Server-side fixture pull | PASS | `/sync/pull` returned 33 products, 2 customers and 2 van rows of 50 |
| Local customers/products/van stock | PASS | Customers screen showed 2 customers; product picker showed `PM0B9BYQ1`/`PM0B9BYQ2` with `مخزن السيارة: 50` |
| Manual sync button | PASS | `آخر مزامنة` advanced from 11:46:20Z to 11:48:07Z; pending 0, rejected 0 |
| Offline detection | PASS | `لا يوجد اتصال — تُحفظ العمليات محليًا…` banner appeared when networking was disabled |
| Offline cash sale | PASS | `تم الحفظ…`; outbox showed one `بيع` with `محفوظة، بانتظار الإرسال` |
| Duplicate save tap | PASS | Two rapid taps produced exactly one pending sale; `saving.current` guard held |
| Offline collection | PASS | Outbox showed `تحصيل` 15.00; pending count became 2 |
| No writes while offline | PASS | API had 0 invoices and 0 vouchers before reconnect |
| Reconnect + automatic push | PASS | API then had 1 invoice (40.00) and 1 receipt voucher (15.00) for the test rep/van |
| Manual sync after reconnect | PASS | Pending 0, rejected 0, no duplicate documents (idempotency keys `sync:<opId>`) |
| Server-side document ownership | PASS | Invoice/voucher `representativeId` = test rep, invoice `warehouseId` = test van |
| Day summary | PASS | 2 operations, cash sales 40.00, collections 15.00, expected cash 55.00, `كل العمليات أُرسلت` |
| PDF export | PASS | `Print.printToFileAsync` + share sheet opened with a generated `.pdf` |
| Barcode scanner UI / camera permission | PASS | Permission granted and full-screen `CameraView` opened with a close button |
| Barcode decode with a real code | NOT TESTED | no physical/virtual barcode was presented to the emulator camera |
| Return flow and close-day flow | NOT TESTED | outside this sync/offline verification pass |
| Direct SQLite file inspection | NOT TESTED | Expo Go is not debuggable/rootable here; data was verified through the SQLite-backed UI and API |

### Bug found and fixed during the device run

Typing a partial quantity (`1.`) in the sale screen caused a render crash: `Invalid number: ` from `parseScaled` via
`cartTotal`. This was not caught by the previous 69 unit tests. Fixed by adding `isPositiveQuantity` and
`estimateCartTotal` in `apps/mobile/src/core/cart.ts`, using them in `SaleScreen`, and adding a regression test in
`cart.spec.ts`. After the fix, the emulator showed total `0.00` for `1.` with no red screen, and the sale saved
correctly once the quantity became `2`. Mobile Jest is now 70/70 and typecheck passes.

## Expo SDK 52 → 58 upgrade (mobile)

Reason: a phone's Expo Go from the Play Store / App Store opens only the current SDK (58); the app was on SDK 52, which only
the old Expo Go used in the emulator run above could open. Now: expo ~58.1, react-native 0.88.1, react 19.3, expo-sqlite ~58,
expo-camera ~58, netinfo 12; the old Kotlin 1.9.25 pin was removed (SDK 58 needs the toolchain default).

| Check | Result |
|---|---|
| `tsc --noEmit` (mobile) | PASS |
| mobile jest | PASS 70 in 14 suites |
| Metro bundle, Android (`expo export`) | PASS, 688 modules |
| Metro bundle, iOS (`expo export`) | PASS, 690 modules |
| `expo-doctor` | 18/20; the 2 failures were network-only (could not reach exp.host) |
| Web typecheck, accounting-engine tests | PASS (no regression from the shared lockfile change) |
| Run on a real phone / emulator with SDK 58 Expo Go | NOT TESTED |
| EAS Android/iOS build | NOT TESTED |

The 16 emulator checks above were made on SDK 52 and must be repeated on SDK 58.
