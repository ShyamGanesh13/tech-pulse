import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, passcode } = await req.json()

  if (
    email?.trim().toLowerCase() === process.env.AUTH_EMAIL?.toLowerCase() &&
    passcode === process.env.AUTH_PASSCODE
  ) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('tp_session', process.env.AUTH_SECRET!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return res
  }

  return NextResponse.json({ error: 'Invalid email or passcode' }, { status: 401 })
}
