'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** Loads `path` (null = do nothing) and ignores answers that arrive after the path changed. */
export function useApi<T>(path: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
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

  return { data, error, loading, reload: useCallback(() => setTick((n) => n + 1), []), setData };
}

/** A paged list with the standard `{items,total,page,pageSize}` envelope. */
export function usePaged<T>(path: string | null): FetchState<Paged<T>> {
  return useApi<Paged<T>>(path);
}

/** Non-paged array endpoint (units, warehouses, accounts, …). */
export function useArray<T>(path: string | null): FetchState<T[]> {
  return useApi<T[]>(path);
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** Turns any list endpoint into <select> options. */
export function useOptions<T>(
  path: string | null,
  map: (row: T) => Option,
  deps: unknown[] = [],
): { options: Option[]; loading: boolean } {
  const { data } = useApi<T[] | Paged<T>>(path);
  return useMemo(() => {
    if (!data) return { options: [], loading: Boolean(path) };
    const rows = Array.isArray(data) ? data : data.items;
    return { options: rows.map(map), loading: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ...deps]);
}

export interface Me {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export function useMe(): Me | null {
  const { data } = useApi<Me>('auth/me');
  return data;
}

export function can(me: Me | null, code: string): boolean {
  if (!me) return false;
  return me.permissions.includes(code);
}

/** Reads a query-string value on the client (no Suspense boundary needed). */
export function useUrlParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name));
  }, [name]);
  return value;
}

/** Debounces a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Local form state with a setter per field. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);
  const reset = useCallback((next: T) => setValues(next), []);
  return { values, set, reset, setValues };
}
