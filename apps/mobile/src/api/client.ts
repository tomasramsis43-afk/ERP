import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { normalizeServerUrl } from '../core/serverUrl';
import { DEFAULT_TIMEOUT_MS, NetworkError, errorMessage, fetchWithTimeout, safeJson, singleFlight } from '../core/http';
import { ServerResult } from '../core/outbox';
import { Snapshot, SyncApi } from '../sync/syncEngine';

const EXTRA = Constants.expoConfig?.extra as { apiUrl?: string; allowHttp?: boolean } | undefined;
/** Plain HTTP (LAN servers) is allowed only in development and preview builds; see app.config.js. */
const ALLOW_HTTP = EXTRA?.allowHttp === true;
const DEFAULT_BASE = EXTRA?.apiUrl ?? 'http://10.0.2.2:3001/api/v1';
const SERVER = 'erp.server';
const ACCESS = 'erp.access';
const REFRESH = 'erp.refresh';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Marker message of the ApiError thrown when the session can no longer be renewed and the user must sign in again. */
export const SESSION_EXPIRED = 'SESSION_EXPIRED';

type Listener = () => void;
const expiredListeners = new Set<Listener>();
/** Lets the app react when the session ends (it shows the login screen; the local outbox is untouched). */
export function onSessionExpired(cb: Listener): () => void {
  expiredListeners.add(cb);
  return () => void expiredListeners.delete(cb);
}

export async function getServerUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SERVER);
  // A plain-http address saved by an older or development build is ignored in a production build.
  if (stored && (ALLOW_HTTP || /^https:\/\//i.test(stored))) return stored;
  return DEFAULT_BASE;
}

/** Accepts what the user typed, validates it, stores the normalised API base URL, and returns it. */
export async function setServerUrl(input: string): Promise<string> {
  const url = normalizeServerUrl(input, ALLOW_HTTP);
  await SecureStore.setItemAsync(SERVER, url);
  return url;
}

async function raw(path: string, init: RequestInit & { token?: string }, signal?: AbortSignal): Promise<Response> {
  const BASE = await getServerUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return fetchWithTimeout((u, i) => fetch(u, i), `${BASE}${path}`, { ...init, headers }, DEFAULT_TIMEOUT_MS, signal);
}

async function parse<T>(res: Response): Promise<T> {
  const parsed = safeJson(await res.text());
  const body = parsed.ok ? parsed.value : null;
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.statusText || `HTTP ${res.status}`));
  if (!parsed.ok) throw new ApiError(res.status, 'The server returned an unreadable response');
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

type RefreshOutcome = 'OK' | 'REJECTED' | 'UNREACHABLE';

/**
 * Refresh tokens rotate: the new pair replaces the old one. Concurrent callers share ONE refresh (a second parallel
 * refresh would present an already-used token). Only an explicit rejection (401/403) ends the session; a network
 * failure or a 5xx keeps it so a rep in a dead zone is not signed out.
 */
const refresh = singleFlight(async (): Promise<RefreshOutcome> => {
  const refreshToken = await SecureStore.getItemAsync(REFRESH);
  if (!refreshToken) return 'REJECTED';
  let res: Response;
  try {
    res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  } catch {
    return 'UNREACHABLE';
  }
  if (res.status === 401 || res.status === 403) return 'REJECTED';
  if (!res.ok) return 'UNREACHABLE';
  const parsed = safeJson(await res.text());
  const t = parsed.ok ? (parsed.value as { accessToken?: string; refreshToken?: string } | null) : null;
  if (!t?.accessToken || !t.refreshToken) return 'UNREACHABLE';
  await SecureStore.setItemAsync(ACCESS, t.accessToken);
  await SecureStore.setItemAsync(REFRESH, t.refreshToken);
  return 'OK';
});

async function endSession(): Promise<never> {
  await logout();
  expiredListeners.forEach((cb) => cb());
  throw new ApiError(401, SESSION_EXPIRED);
}

async function authed<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let token = (await SecureStore.getItemAsync(ACCESS)) ?? undefined;
  let res = await raw(path, { ...init, token }, signal);
  if (res.status === 401) {
    const outcome = await refresh();
    if (outcome === 'REJECTED') return endSession();
    if (outcome === 'UNREACHABLE') throw new NetworkError('OFFLINE', 'Could not renew the session; try again when online');
    token = (await SecureStore.getItemAsync(ACCESS)) ?? undefined;
    res = await raw(path, { ...init, token }, signal);
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
  pull: (productsSince: string | null) =>
    authed<Snapshot>(productsSince ? `/sync/pull?productsSince=${encodeURIComponent(productsSince)}` : '/sync/pull'),
};
