import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { normalizeServerUrl } from '../core/serverUrl';
import { ServerResult } from '../core/outbox';
import { Snapshot, SyncApi } from '../sync/syncEngine';

const DEFAULT_BASE = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:3001/api/v1';
const SERVER = 'erp.server';
const ACCESS = 'erp.access';
const REFRESH = 'erp.refresh';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The request never produced an HTTP answer (offline, DNS, timeout). Callers keep the operation queued and retry later. */
export class NetworkError extends Error {
  constructor(readonly kind: 'TIMEOUT' | 'OFFLINE', message: string) {
    super(message);
  }
}

/** The refresh token was refused: the user must log in again. Local operations stay in the outbox. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'SESSION_EXPIRED');
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

export async function getServerUrl(): Promise<string> {
  return (await SecureStore.getItemAsync(SERVER)) ?? DEFAULT_BASE;
}

/** Accepts what the user typed, validates it, stores the normalised API base URL, and returns it. */
export async function setServerUrl(input: string): Promise<string> {
  const url = normalizeServerUrl(input);
  await SecureStore.setItemAsync(SERVER, url);
  return url;
}

async function raw(path: string, init: RequestInit & { token?: string }): Promise<Response> {
  const BASE = await getServerUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
  } catch (e) {
    const timedOut = controller.signal.aborted;
    throw new NetworkError(timedOut ? 'TIMEOUT' : 'OFFLINE', timedOut ? 'Request timed out' : e instanceof Error ? e.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: { message?: string | string[] } | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as { message?: string | string[] };
    } catch {
      // A proxy error page or truncated body is not JSON; report the status instead of crashing.
      if (!res.ok) throw new ApiError(res.status, res.statusText || `HTTP ${res.status}`);
      throw new ApiError(res.status, 'Invalid server response');
    }
  }
  if (!res.ok) throw new ApiError(res.status, Array.isArray(body?.message) ? body.message.join('; ') : body?.message ?? res.statusText);
  return body as T;
}

export async function login(email: string, password: string): Promise<void> {
  const t = await parse<{ accessToken: string; refreshToken: string }>(await raw('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
  await SecureStore.setItemAsync(ACCESS, t.accessToken);
  await SecureStore.setItemAsync(REFRESH, t.refreshToken);
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}

export const hasSession = async (): Promise<boolean> => Boolean(await SecureStore.getItemAsync(REFRESH));

/** Refresh tokens rotate: the new pair replaces the old one, and a failed refresh means logging in again. */
let refreshInFlight: Promise<boolean> | null = null;

/** Concurrent 401s share one refresh request; with rotating tokens a second parallel refresh would invalidate the first. */
function refresh(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH);
  if (!refreshToken) return false;
  const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  if (res.status === 401 || res.status === 403) {
    // Refused for good: drop the dead tokens (the outbox is untouched).
    await logout();
    return false;
  }
  if (!res.ok) throw new ApiError(res.status, 'Token refresh failed');
  const t = (await res.json()) as { accessToken: string; refreshToken: string };
  await SecureStore.setItemAsync(ACCESS, t.accessToken);
  await SecureStore.setItemAsync(REFRESH, t.refreshToken);
  return true;
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = (await SecureStore.getItemAsync(ACCESS)) ?? undefined;
  let res = await raw(path, { ...init, token });
  if (res.status === 401) {
    if (!(await refresh())) throw new SessionExpiredError();
    token = (await SecureStore.getItemAsync(ACCESS)) ?? undefined;
    res = await raw(path, { ...init, token });
  }
  return parse<T>(res);
}

export const get = <T>(path: string) => authed<T>(path);
export const post = <T>(path: string, body: unknown) => authed<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const syncApi: SyncApi = {
  async push(deviceId, operations) {
    const r = await authed<{ results: ServerResult[] }>('/sync/push', { method: 'POST', body: JSON.stringify({ deviceId, operations }) });
    return r.results;
  },
  pull: () => authed<Snapshot>('/sync/pull'),
};
