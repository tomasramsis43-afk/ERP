# Mobile offline and sync design (as implemented)

- Every financial action is saved locally by `saveOperation`: outbox row + receipt + van stock in ONE SQLite transaction.
  The operation id (`opId`, UUID) is created once and is the server's idempotency key (`sync:<opId>`).
- All SQLite writes pass through one serial queue (`core/serial.ts`).
- Sync (`sync/syncEngine.ts`): push pending operations oldest first in batches of 100; apply the server's answer per
  operation (`APPLIED`/`DUPLICATE` delete, `REJECTED` flag with reason, `RETRY`/missing keep and count an attempt);
  only then pull a snapshot. The snapshot is stored only if nothing is pending (checked inside the write transaction).
- HTTP 200 is not treated as success; each operation's own result decides.
- `startAutoSync`: runs on reconnect, one shared run for button/timer/reconnect, backoff 5 s doubling to 5 min.
- States shown: LOCAL_PENDING, SYNCING, RETRY_PENDING, SERVER_REJECTED. Accepted operations leave the queue (receipts
  stay 30 days). CONFLICT does not exist: final money/stock decisions are made by the server (rejections are shown).
- Day closing is online-only and blocked while any operation is unsent.
- Session: tokens in SecureStore; a refresh failure by explicit 401/403 shows login, a network failure does not;
  the outbox is never touched by logout or expiry.
- Not implemented: incremental pull, background (OS-level) sync when the app is closed, payload compression.
