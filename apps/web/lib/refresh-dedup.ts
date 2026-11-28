/**
 * Coalesces concurrent token refreshes for the same refresh token so parallel
 * 401 responses from the web proxy do not trigger single-use refresh-token
 * reuse detection on the API.
 */
export function createRefreshDeduplicator<T>() {
  const inflight = new Map<string, Promise<T | null>>();

  return function deduplicate(key: string, work: () => Promise<T | null>): Promise<T | null> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = work().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}
