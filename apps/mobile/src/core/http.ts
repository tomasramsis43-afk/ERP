/** Platform-independent HTTP helpers for the API client (unit tested; the client wires them to fetch/SecureStore). */

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Thrown for failures that are not an HTTP answer: no network, timeout, or a cancelled request. */
export class NetworkError extends Error {
  constructor(readonly kind: 'TIMEOUT' | 'OFFLINE' | 'CANCELLED', message: string) {
    super(message);
  }
}

export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * fetch with a deadline and optional caller cancellation (AbortController). Failures become NetworkError so
 * callers can tell "the server said no" from "we never reached the server".
 */
export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onCallerAbort);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new NetworkError('TIMEOUT', 'The server took too long to respond');
    if (signal?.aborted) throw new NetworkError('CANCELLED', 'Request cancelled');
    throw new NetworkError('OFFLINE', e instanceof Error ? e.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

/** Parses a response body without throwing on empty or non-JSON text (proxies and gateways return HTML errors). */
export function safeJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Builds a readable error message from a NestJS-style body ({ message: string | string[] }). */
export function errorMessage(body: unknown, fallback: string): string {
  const m = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(m)) return m.join('; ');
  return typeof m === 'string' && m ? m : fallback;
}

/**
 * Runs `fn` once at a time: concurrent callers share the one in-flight promise.
 * Refresh tokens rotate, so two parallel refreshes would make the second use an already-used token.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    inflight ??= fn().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
