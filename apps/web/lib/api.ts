export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === 'string') return body;
  // The API wraps errors as { statusCode, error: { message: string | string[] } }.
  const b = body as { message?: unknown; error?: unknown };
  const inner = b.error && typeof b.error === 'object' ? (b.error as { message?: unknown }) : null;
  const message = b.message ?? inner?.message;
  if (Array.isArray(message)) return message.join(' · ');
  if (typeof message === 'string') return message;
  if (typeof b.error === 'string') return b.error;
  return fallback;
}

/** Every call goes through the same-origin proxy so the httpOnly cookies never leave the server. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
    throw new ApiError('انتهت الجلسة، سجّل الدخول من جديد', 401);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) throw new ApiError(messageOf(body, res.statusText || `HTTP ${res.status}`), res.status, body);
  return body as T;
}

export const get = <T,>(path: string): Promise<T> => api<T>(path);
export const post = <T,>(path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = <T,>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T,>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });

/** Opens a proxied file (Excel/PDF export) in a new tab, keeping the session cookies. */
export function download(path: string): void {
  window.open(`/api/proxy/${path.replace(/^\//, '')}`, '_blank');
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
