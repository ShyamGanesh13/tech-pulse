import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'

const PUBLIC_PREFIXES = ['/login', '/api/auth']

// Exact-match exemptions. Kept separate from PUBLIC_PREFIXES on purpose: prefix
// matching would also exempt anything merely STARTING with this path, and these
// endpoints authenticate themselves rather than relying on the cookie gate.
//
// /api/ninaivu/due is the reminder endpoint. Platform cron invocations carry no
// cookies, so the gate below would redirect them to /login and the daily
// reminder would never fire (which is exactly what was happening). It is safe to
// exempt ONLY because the route now authenticates both of its own callers: GET
// requires a CRON_SECRET bearer token, POST requires a session via lib/auth.
const SELF_AUTHENTICATED = [
  '/api/ninaivu/due',
]

// /api/refresh is NO LONGER exempt, and /api/catalyst-verify is gone.
//
// Refresh used to have a CRON_SECRET-gated GET for the scheduled fetch. A
// refresh is per-tenant now — it pulls the caller's subscribed sources and
// topics and rebuilds only their rows — so a bearer-authenticated request with
// no session has no tenant to fetch for. Scheduled refresh was dropped in favour
// of on-demand, the GET was deleted, and the exemption had to go with it: left
// behind it would exempt the path for every method, making the POST anonymous
// and letting anyone trigger a ten-source fetch.

// Exact-match, not a prefix — `pathname.startsWith('/')` would exempt every
// route in the app. The root page does its own check (lib/auth.ts) and
// branches: signed in -> redirect to /home, signed out -> render the public
// landing page. It needs to run for logged-out visitors, so it can't sit
// behind the cookie gate below.
const PUBLIC_EXACT = ['/']

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
    SELF_AUTHENTICATED.includes(pathname) ||
    PUBLIC_EXACT.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
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
