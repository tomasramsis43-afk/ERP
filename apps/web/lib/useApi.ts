'use client';

import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(Array.isArray(body?.message) ? body.message.join('; ') : body?.message ?? res.statusText);
  return body as T;
}

export interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Loads `path` (null = do nothing) and ignores answers that arrive after the path changed. */
export function useApi<T>(path: string | null): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let stale = false;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => !stale && setData(d))
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [path, tick]);

  return { data, error, loading, reload: useCallback(() => setTick((n) => n + 1), []) };
}
