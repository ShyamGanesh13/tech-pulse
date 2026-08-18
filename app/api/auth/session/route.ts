import { NextRequest, NextResponse } from 'next/server'
import { resolveGoogleUser } from '@/lib/users'
import { createSessionToken } from '@/lib/session'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

// Verifies a Firebase ID token using Firebase's REST API (no Admin SDK needed).
// localId is the stable Firebase UID and is what we key the tenant on.
async function verifyFirebaseToken(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  )
  if (!res.ok) return null
  const data = await res.json()
  const u = data.users?.[0]
  if (!u?.localId || !u?.email) return null
  return {
    firebaseUid: u.localId as string,
    email: u.email as string,
    name: (u.displayName ?? null) as string | null,
    picture: (u.photoUrl ?? null) as string | null,
  }
}

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  if (!idToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const secret = process.env.AUTH_SECRET
  if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const user = await resolveGoogleUser(identity)
  const token = createSessionToken(user.id, secret, Date.now())

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  // tp_user is deliberately not set: it was httpOnly:false and therefore
  // client-writable, so it can never be an input to a tenancy decision.
  return res
}
