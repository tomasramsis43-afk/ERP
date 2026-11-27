import NetInfo from '@react-native-community/netinfo';
import { syncApi } from '../api/client';
import { backoffMs } from '../core/backoff';
import { singleFlight } from '../core/http';
import { getDeviceId, store } from '../db/database';
import { SyncReport, synchronize } from './syncEngine';

/** The one place a sync runs. Concurrent callers (button, reconnect, timer) share a single run: no overlapping pushes. */
export const runSync = singleFlight(async (): Promise<SyncReport> => synchronize(syncApi, store, await getDeviceId()));

/**
 * Syncs automatically when the phone comes online and retries with exponential backoff while something is still
 * pending or failing. Returns a stop function. `onDone` fires after every run so screens can reload local data.
 */
export function startAutoSync(onDone: (r: SyncReport) => void): () => void {
  let stopped = false;
  let online = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    if (!stopped) timer = setTimeout(() => void attempt(), ms);
  };
  async function attempt() {
    clear();
    if (stopped || !online) return;
    let report: SyncReport | null = null;
    try {
      report = await runSync();
    } catch {
      /* a session that cannot be renewed is handled by the client (login screen); retry later */
    }
    if (stopped) return;
    if (report) onDone(report);
    const stillWorking = !report || report.error || report.pending > 0 || !report.pulled;
    if (stillWorking) {
      failures += 1;
      schedule(backoffMs(failures));
    } else {
      failures = 0;
    }
  }

  const unsubscribe = NetInfo.addEventListener((state) => {
    const nowOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (nowOnline && !online) {
      online = true;
      failures = 0;
      void attempt();
    } else if (!nowOnline) {
      online = false;
      clear();
    }
  });
  return () => {
    stopped = true;
    clear();
    unsubscribe();
  };
}
