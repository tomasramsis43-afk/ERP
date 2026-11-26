import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { ServerResult } from '../core/outbox';
import { Snapshot, SyncApi } from '../sync/syncEngine';

const BASE = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:3001/api/v1';
const ACCESS = 'erp.access';
const REFRESH = 'erp.refresh';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit & { token?: string }): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
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
async function refresh(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH);
  if (!refreshToken) return false;
  const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
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

export const syncApi: SyncApi = {
  async push(deviceId, operations) {
    const r = await authed<{ results: ServerResult[] }>('/sync/push', { method: 'POST', body: JSON.stringify({ deviceId, operations }) });
    return r.results;
  },
  pull: () => authed<Snapshot>('/sync/pull'),
};
