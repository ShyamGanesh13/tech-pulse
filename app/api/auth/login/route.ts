import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminUser } from '@/lib/users'
import { createSessionToken } from '@/lib/session'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, passcode } = await req.json()

  const adminEmail = process.env.AUTH_EMAIL
  const secret = process.env.AUTH_SECRET
  if (!adminEmail || !process.env.AUTH_PASSCODE || !secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const emailMatches = email?.trim().toLowerCase() === adminEmail.toLowerCase()
  if (!emailMatches || passcode !== process.env.AUTH_PASSCODE) {
    return NextResponse.json({ error: 'Invalid email or passcode' }, { status: 401 })
  }

  const user = await resolveAdminUser(adminEmail.toLowerCase())
  const token = createSessionToken(user.id, secret, Date.now())

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}
