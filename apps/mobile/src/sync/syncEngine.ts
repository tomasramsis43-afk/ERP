import { OutboxItem, ServerResult, batches, sendable } from '../core/outbox';

/** Server operations the engine needs; implemented over HTTP in the app and by a fake in tests. */
export interface SyncApi {
  push(deviceId: string, operations: { opId: string; type: string; clientCreatedAt: string; payload: Record<string, unknown> }[]): Promise<ServerResult[]>;
  pull(): Promise<Snapshot>;
}

export interface Snapshot {
  serverTime: string;
  [key: string]: unknown;
}

/**
 * Local persistence the engine needs; SQLite in the app, memory in tests.
 * The engine never rewrites the whole queue: other code (the sale screen) adds operations while a sync runs,
 * and a whole-queue rewrite would delete them.
 */
export interface SyncStore {
  loadOutbox(): Promise<OutboxItem[]>;
  /** Folds the server's answers into the stored queue, touching only the operations that were answered. */
  applyResults(results: ServerResult[]): Promise<void>;
  /**
   * Stores the snapshot only if no operation is still waiting to be sent (checked atomically with the write),
   * so a sale saved during the sync can never be overwritten by older server data. Returns whether it was stored.
   */
  saveSnapshot(s: Snapshot): Promise<boolean>;
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
export async function synchronize(api: SyncApi, store: SyncStore, deviceId: string): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, applied: 0, rejected: 0, pending: 0, pulled: false };
  try {
    for (const batch of batches(sendable(await store.loadOutbox()), BATCH)) {
      const results = await api.push(deviceId, batch.map((b) => ({ opId: b.opId, type: b.type, clientCreatedAt: b.clientCreatedAt, payload: b.payload })));
      report.sent += batch.length;
      report.applied += results.filter((r) => r.status === 'APPLIED' || r.status === 'DUPLICATE').length;
      report.rejected += results.filter((r) => r.status === 'REJECTED').length;
      await store.applyResults(results); // persist after every batch so a crash never loses an answer
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.pending = sendable(await store.loadOutbox()).length;
    return report;
  }
  // Re-read the queue: operations saved while this sync was running are pending too.
  report.pending = sendable(await store.loadOutbox()).length;
  if (report.pending > 0) return report;
  try {
    report.pulled = await store.saveSnapshot(await api.pull());
    if (!report.pulled) report.pending = sendable(await store.loadOutbox()).length;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}
