import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE, TokenPair, storeTokens } from '@/lib/session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function forward(req: NextRequest, path: string[], token: string | undefined): Promise<Response> {
  const url = `${API_URL}/${path.join('/')}${req.nextUrl.search}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return fetch(url, {
    method: req.method,
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: hasBody ? await req.text() : undefined,
    cache: 'no-store',
  });
}

/** Rotates the token pair once when the access token has expired. */
async function refresh(): Promise<string | null> {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
  if (!res.ok) return null;
  const pair = (await res.json()) as TokenPair;
  storeTokens(pair);
  return pair.accessToken;
}

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  let token = cookies().get(ACCESS_COOKIE)?.value;
  let upstream = await forward(req, params.path, token);
  if (upstream.status === 401) {
    token = (await refresh()) ?? undefined;
    if (!token) return NextResponse.json({ message: 'Session expired' }, { status: 401 });
    upstream = await forward(req, params.path, token);
  }
  // Pass the body through untouched so Excel/PDF downloads keep working.
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
