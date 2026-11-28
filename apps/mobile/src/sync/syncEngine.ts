import { OutboxItem, ServerResult, batches, sendable } from '../core/outbox';
import { Snapshot, SnapshotMismatchError } from '../core/snapshotMerge';

export type { Snapshot };

/** Server operations the engine needs; implemented over HTTP in the app and by a fake in tests. */
export interface SyncApi {
  push(deviceId: string, operations: { opId: string; type: string; clientCreatedAt: string; payload: Record<string, unknown> }[]): Promise<ServerResult[]>;
  /** `since` is the serverTime of the last successful pull; null asks for the full snapshot. */
  pull(since: string | null): Promise<Snapshot>;
}

/** Local persistence the engine needs; SQLite in the app, memory in tests. */
export interface SyncStore {
  loadOutbox(): Promise<OutboxItem[]>;
  /**
   * Folds the server's per-operation answers into the queue row by row, in one transaction.
   * It must never rewrite the whole queue: a sale saved while a sync is in flight has to survive.
   */
  applyServerResults(results: ServerResult[]): Promise<void>;
  /** serverTime of the last stored snapshot, or null if none. */
  lastSyncTime(): Promise<string | null>;
  /** Stores a snapshot; a delta is merged into the local data and throws SnapshotMismatchError if it cannot be. */
  saveSnapshot(s: Snapshot): Promise<void>;
}

export interface SyncReport {
  sent: number;
  applied: number;
  rejected: number;
  pending: number;
  pulled: boolean;
  error?: string;
}

const BATCH = 100;

/**
 * Push first, then pull: the phone's own pending sales must reach the server before the snapshot
 * replaces local stock and balances, otherwise the pull would erase sales the server has not seen yet.
 * If anything is still pending or any push failed, the pull is skipped and local data is kept.
 */
let inFlight: Promise<SyncReport> | null = null;

/** Only one synchronisation runs at a time; a second call (double tap, background trigger) joins the running one. */
export function synchronize(api: SyncApi, store: SyncStore, deviceId: string): Promise<SyncReport> {
  if (inFlight) return inFlight;
  inFlight = run(api, store, deviceId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(api: SyncApi, store: SyncStore, deviceId: string): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, applied: 0, rejected: 0, pending: 0, pulled: false };
  // Only what was queued when the sync started is sent; anything saved meanwhile waits for the next sync.
  const toSend = sendable(await store.loadOutbox());
  try {
    for (const batch of batches(toSend, BATCH)) {
      const results = await api.push(deviceId, batch.map((b) => ({ opId: b.opId, type: b.type, clientCreatedAt: b.clientCreatedAt, payload: b.payload })));
      report.sent += batch.length;
      report.applied += results.filter((r) => r.status === 'APPLIED' || r.status === 'DUPLICATE').length;
      report.rejected += results.filter((r) => r.status === 'REJECTED').length;
      await store.applyServerResults(results); // persisted after every batch so a crash never loses an answer
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.pending = sendable(await store.loadOutbox()).length;
    return report;
  }
  // Re-read the queue: a sale saved during the push is pending, and a pull now would erase its stock effect.
  report.pending = sendable(await store.loadOutbox()).length;
  if (report.pending > 0) return report;
  try {
    await pullAndStore(api, store);
    report.pulled = true;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}

/** After this long without a pull the phone asks for everything again, a safety net for any change a delta could miss. */
const FULL_RESYNC_AFTER_MS = 24 * 60 * 60 * 1000;

async function pullAndStore(api: SyncApi, store: SyncStore): Promise<void> {
  const last = await store.lastSyncTime();
  const lastMs = last ? Date.parse(last) : NaN;
  const useDelta = Number.isFinite(lastMs) && Date.now() - lastMs < FULL_RESYNC_AFTER_MS;
  try {
    await store.saveSnapshot(await api.pull(useDelta ? last : null));
  } catch (e) {
    // A delta that does not fit what is stored is not an error for the user: fetch everything instead.
    if (!(e instanceof SnapshotMismatchError) || !useDelta) throw e;
    await store.saveSnapshot(await api.pull(null));
  }
}
