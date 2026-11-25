import { NextResponse } from 'next/server';
import { API_URL, REFRESH_COOKIE, clearTokens } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST() {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    // Revoke on the server too; failure to reach it must not keep the user logged in locally.
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  }
  clearTokens();
  return NextResponse.json({ ok: true });
}
