import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`${origin}/login?error=google_cancelled`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const authSecret = process.env.AUTH_SECRET

  if (!clientId || !clientSecret || !authSecret) {
    return NextResponse.redirect(`${origin}/login?error=misconfigured`)
  }

  const redirectUri = `${origin}/api/auth/google/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json()
  const accessToken: string = tokens.access_token

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!userRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=userinfo_failed`)
  }

  const user = await userRes.json()
  const email: string = user.email ?? ''

  const userData = JSON.stringify({
    name: user.name ?? email,
    email,
    picture: user.picture ?? null,
  })

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  }

  const res = NextResponse.redirect(`${origin}/home`)
  // Reuse the same session mechanism so middleware needs no changes
  res.cookies.set('tp_session', authSecret, cookieOpts)
  // Store user display info (not security-sensitive)
  res.cookies.set('tp_user', userData, { ...cookieOpts, httpOnly: false })
  return res
}
