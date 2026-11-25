import { NextRequest, NextResponse } from 'next/server';

/** Pages need a session cookie; the API itself still verifies the token on every call. */
export function middleware(req: NextRequest) {
  const loggedIn = req.cookies.has('erp_refresh');
  const { pathname } = req.nextUrl;
  if (!loggedIn && !pathname.startsWith('/login')) return NextResponse.redirect(new URL('/login', req.url));
  if (loggedIn && pathname.startsWith('/login')) return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
