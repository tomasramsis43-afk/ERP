import { NextResponse } from 'next/server';
import { API_URL, TokenPair, storeTokens } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body?.email, password: body?.password }),
  });
  if (!res.ok) return NextResponse.json({ message: 'Invalid email or password' }, { status: res.status === 429 ? 429 : 401 });
  storeTokens((await res.json()) as TokenPair);
  return NextResponse.json({ ok: true });
}
