import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  // Clear the legacy client-writable cookie for anyone still carrying one.
  res.cookies.set('tp_user', '', { maxAge: 0, path: '/' })
  return res
}
