import { NextRequest, NextResponse } from 'next/server'

const PUBLIC = ['/login', '/api/auth']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths and Next.js internals
  if (PUBLIC.some(p => pathname.startsWith(p)) || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  const session = req.cookies.get('tp_session')?.value
  if (!session || session !== process.env.AUTH_SECRET) {
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
