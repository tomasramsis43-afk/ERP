import { OutboxItem, ServerResult, applyResults, batches, sendable } from '../core/outbox';

/** Server operations the engine needs; implemented over HTTP in the app and by a fake in tests. */
export interface SyncApi {
  push(deviceId: string, operations: { opId: string; type: string; clientCreatedAt: string; payload: Record<string, unknown> }[]): Promise<ServerResult[]>;
  pull(): Promise<Snapshot>;
}

export interface Snapshot {
  serverTime: string;
  [key: string]: unknown;
}

/** Local persistence the engine needs; SQLite in the app, memory in tests. */
export interface SyncStore {
  loadOutbox(): Promise<OutboxItem[]>;
  saveOutbox(items: OutboxItem[]): Promise<void>;
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
export async function synchronize(api: SyncApi, store: SyncStore, deviceId: string): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, applied: 0, rejected: 0, pending: 0, pulled: false };
  let outbox = await store.loadOutbox();
  try {
    for (const batch of batches(sendable(outbox), BATCH)) {
      const results = await api.push(deviceId, batch.map((b) => ({ opId: b.opId, type: b.type, clientCreatedAt: b.clientCreatedAt, payload: b.payload })));
      report.sent += batch.length;
      report.applied += results.filter((r) => r.status === 'APPLIED' || r.status === 'DUPLICATE').length;
      report.rejected += results.filter((r) => r.status === 'REJECTED').length;
      outbox = applyResults(outbox, results);
      await store.saveOutbox(outbox); // persist after every batch so a crash never loses an answer
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.pending = sendable(outbox).length;
    return report;
  }
  report.pending = sendable(outbox).length;
  if (report.pending > 0) return report;
  try {
    await store.saveSnapshot(await api.pull());
    report.pulled = true;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}
