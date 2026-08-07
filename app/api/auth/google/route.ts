import { NextRequest, NextResponse } from 'next/server'

const SCOPES = ['openid', 'email', 'profile'].join(' ')

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/auth/google/callback`

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('prompt', 'select_account')

  return NextResponse.redirect(url.toString())
}
