import { NextRequest, NextResponse } from 'next/server'

// Verifies a Firebase ID token using Firebase's REST API (no Admin SDK needed).
// Returns the user's email/name/picture on success, null on failure.
async function verifyFirebaseToken(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  const u = data.users?.[0]
  if (!u) return null
  return {
    email:   u.email   ?? '',
    name:    u.displayName ?? u.email ?? '',
    picture: u.photoUrl   ?? null,
  }
}

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  if (!idToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const user = await verifyFirebaseToken(idToken)
  if (!user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('tp_session', authSecret, cookieOpts)
  res.cookies.set('tp_user', JSON.stringify(user), { ...cookieOpts, httpOnly: false })
  return res
}
