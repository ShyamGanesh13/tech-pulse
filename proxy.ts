import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

const PUBLIC_PREFIXES = ['/login', '/api/auth']

// Optimistic gate only. The Next 16 docs require proxy to read the cookie and
// never touch the database, because it runs on every request including
// prefetches. Real authorisation happens per-route in lib/auth.ts.
//
// NOTE: the uid is deliberately NOT forwarded to routes in a request header.
// Proxy is not the authority; if this matcher ever missed a path, a
// client-supplied header would be trusted. Routes verify the cookie themselves.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get('tp_session')?.value
  const session = verifySessionToken(token, process.env.AUTH_SECRET ?? '', Date.now())

  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons|favicon.ico).*)'],
}
