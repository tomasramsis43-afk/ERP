export type OpType = 'SALE' | 'RETURN' | 'COLLECTION';
export type LocalStatus = 'PENDING' | 'REJECTED';

export interface OutboxItem {
  opId: string;
  type: OpType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  status: LocalStatus;
  error: string | null;
  attempts: number;
}

export type ServerResult =
  | { opId: string; status: 'APPLIED' | 'DUPLICATE'; resultId: string | null }
  | { opId: string; status: 'REJECTED'; error: string }
  | { opId: string; status: 'RETRY'; error: string };

export type DisplayStatus = 'LOCAL_PENDING' | 'SYNCING' | 'RETRY_PENDING' | 'SERVER_REJECTED';

/**
 * What the representative sees for each queued operation. Accepted operations leave the queue (the server has them
 * exactly once), so SERVER_ACCEPTED is reported as a count after a sync, never as a row.
 */
export function displayStatus(item: OutboxItem, syncing: boolean): DisplayStatus {
  if (item.status === 'REJECTED') return 'SERVER_REJECTED';
  if (syncing) return 'SYNCING';
  return item.attempts > 0 ? 'RETRY_PENDING' : 'LOCAL_PENDING';
}

/** Operations the next sync should send, oldest first. Rejected ones wait for the user to review them. */
export function sendable(items: OutboxItem[]): OutboxItem[] {
  return items.filter((i) => i.status === 'PENDING').sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt));
}

/**
 * Folds the server's answer into the local queue:
 *  APPLIED / DUPLICATE → delete (the server has it, exactly once)
 *  REJECTED            → keep, flagged, with the reason, never resent automatically
 *  RETRY / missing     → keep as is, try again next time
 */
export function applyResults(items: OutboxItem[], results: ServerResult[]): OutboxItem[] {
  const byId = new Map(results.map((r) => [r.opId, r]));
  const next: OutboxItem[] = [];
  for (const item of items) {
    const r = byId.get(item.opId);
    if (!r) {
      next.push(item);
    } else if (r.status === 'APPLIED' || r.status === 'DUPLICATE') {
      continue;
    } else if (r.status === 'REJECTED') {
      next.push({ ...item, status: 'REJECTED', error: r.error, attempts: item.attempts + 1 });
    } else {
      next.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  return next;
}

/** Splits a queue into server-sized batches. */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
