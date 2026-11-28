import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { normalizeServerUrl } from '../core/serverUrl';
import { ServerResult } from '../core/outbox';
import { Snapshot, SyncApi } from '../sync/syncEngine';

const DEFAULT_BASE = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:3001/api/v1';
const SERVER = 'erp.server';
const ACCESS = 'erp.access';
const REFRESH = 'erp.refresh';

const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

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
  // A request that never answers (dead mobile data, a cold-starting server) must not freeze the screen.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, timedOut ? 'Request timed out' : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: { message?: string | string[] } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // An HTML error page from a proxy or a cold-starting host is not JSON; report the HTTP status instead.
    if (res.ok) throw new ApiError(res.status, 'Invalid response from server');
  }
  if (!res.ok) throw new ApiError(res.status, Array.isArray(body?.message) ? body.message.join('; ') : body?.message ?? (res.statusText || `HTTP ${res.status}`));
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
let refreshing: Promise<boolean> | null = null;

/** Several requests can get 401 together; only one refresh may run, because the old refresh token dies on first use. */
function refresh(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH);
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  } catch {
    return false; // offline: keep the session and the outbox, try again later
  }
  if (!res.ok) return false;
  const t = (await res.json()) as { accessToken: string; refreshToken: string };
  await SecureStore.setItemAsync(ACCESS, t.accessToken);
  await SecureStore.setItemAsync(REFRESH, t.refreshToken);
  return true;
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = (await SecureStore.getItemAsync(ACCESS)) ?? undefined;
  let res = await raw(path, { ...init, token });
  if (res.status === 401 && (await refresh())) {
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
