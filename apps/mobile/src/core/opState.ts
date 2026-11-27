import { OutboxItem } from './outbox';

/** What the representative sees for each operation. SERVER_ACCEPTED operations leave the queue (their receipt remains). */
export type OpDisplayState = 'LOCAL_PENDING' | 'SYNCING' | 'RETRY_PENDING' | 'SERVER_REJECTED';

export function displayState(item: OutboxItem, syncing: boolean): OpDisplayState {
  if (item.status === 'REJECTED') return 'SERVER_REJECTED';
  if (syncing) return 'SYNCING';
  return item.attempts > 0 ? 'RETRY_PENDING' : 'LOCAL_PENDING';
}
