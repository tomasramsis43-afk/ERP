# Mobile audit (apps/mobile)

Findings from reading the source (not from a device run). Status: FIXED = changed on branch `fix/mobile-sync-integrity`, covered by jest where noted; OPEN = not addressed.

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | `saveOutbox` deleted and rewrote the whole queue from a copy loaded at sync start, so a sale saved during a sync was erased | FIXED: results applied row by row (`applyServerResults`); test "keeps a sale saved while the push is in flight" |
| 2 | Critical | Sale/return/collection saved outbox, receipt and van stock in separate writes | FIXED: one SQLite transaction (`commitLocal`). Crash-in-the-middle is not tested on a device |
| 3 | High | Device id was the constant `device-local` | FIXED: UUID created once per install (`getDeviceId`, table `meta`) |
| 4 | High | Bare server address defaulted to `http://`; public hosts could be reached without TLS | FIXED in `serverUrl.ts`: public hosts default to https, explicit http to a public host is refused; http stays possible for localhost/emulator/private LAN. `usesCleartextTraffic` remains true because LAN servers are a supported mode |
| 5 | High | Application id `com.example.erpfield` (Android and iOS) | OPEN: changing it breaks updates of installed copies; decide before the first real distribution |
| 6 | Medium | No request timeout, unguarded `JSON.parse`, concurrent refresh calls with rotating refresh tokens | FIXED in `api/client.ts` (20 s timeout, safe parse, single-flight refresh); not unit tested |
| 7 | Medium | No sync lock; no SQLite schema versioning | FIXED: in-flight sync is shared; `PRAGMA user_version` migrations. Upgrade of an existing database not tested on a device |
| 8 | Medium | Pull is a full snapshot | FIXED: `GET /sync/pull?since=` returns a delta (changed products/customers, removed products, full balances, prices, van stock, customer id list); the phone merges by id (`core/snapshotMerge.ts`, jest) and falls back to a full pull on any mismatch or after 24 h. Old servers that ignore `since` still work. Deactivated customers are handled through the customer id list; a product whose row is untouched when only its units change is covered by the 24 h full pull |
| 9 | Medium | Release APK is debug-signed | OPEN: needs a production keystore (not committed) |
| 10 | Info | Screens never run on a device; no barcode, push, printing | OPEN |
