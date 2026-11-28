import { NextResponse } from 'next/server';
import { API_URL, TokenPair, storeTokens } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body?.email, password: body?.password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'الخادم غير متاح أو قيد التشغيل، حاول مرة أخرى بعد لحظات / API server is starting up or unreachable' },
      { status: 503 },
    );
  }
  if (!res.ok) return NextResponse.json({ message: 'Invalid email or password' }, { status: res.status === 429 ? 429 : 401 });
  storeTokens((await res.json()) as TokenPair);
  return NextResponse.json({ ok: true });
}
