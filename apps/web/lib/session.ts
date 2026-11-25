import { cookies } from 'next/headers';

export const API_URL = process.env.API_URL ?? 'http://localhost:3000';
export const ACCESS_COOKIE = 'erp_access';
export const REFRESH_COOKIE = 'erp_refresh';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

const base = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' };

/** Tokens live only in httpOnly cookies, so page scripts (and any XSS) can never read them. */
export function storeTokens(t: TokenPair): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, t.accessToken, { ...base, maxAge: 60 * 60 });
  jar.set(REFRESH_COOKIE, t.refreshToken, { ...base, maxAge: 60 * 60 * 24 * 14 });
}

export function clearTokens(): void {
  const jar = cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
