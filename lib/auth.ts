import { cookies } from 'next/headers'
import { cache } from 'react'
import { NextResponse } from 'next/server'
import { verifySessionToken, SESSION_MAX_AGE_SECONDS, SESSION_COOKIE } from './session'
import { getUserById } from './db'
import type { User } from './types'

// Re-exported so existing consumers (app/api/auth/session, login, logout
// routes) can keep importing SESSION_COOKIE from '@/lib/auth' unchanged. The
// owning definition lives in lib/session.ts, which proxy.ts can also import
// without pulling in next/headers or the database layer.
export { SESSION_COOKIE }

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/' as const,
  }
}

export class UnauthorizedError extends Error {
  constructor() { super('Unauthorized') }
}

// Memoized per render pass so several callers in one request share one read.
const readSession = cache(async () => {
  const jar = await cookies()
  return verifySessionToken(
    jar.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET ?? '',
    Date.now(),
  )
})

export async function getUserIdOrNull(): Promise<string | null> {
  const s = await readSession()
  return s?.uid ?? null
}

export async function requireUserId(): Promise<string> {
  const uid = await getUserIdOrNull()
  if (!uid) throw new UnauthorizedError()
  return uid
}

export async function getCurrentUser(): Promise<User | null> {
  const uid = await getUserIdOrNull()
  if (!uid) return null
  return getUserById(uid)
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
