import { createHmac, timingSafeEqual } from 'crypto'

// Pure token helpers. The secret and the current time are arguments, never read
// from process.env or Date.now() in here: proxy.ts imports this module and the
// Next 16 docs warn against proxy relying on shared modules or globals. Keeping
// it pure also makes it trivially testable without mocking the clock.

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  uid: string
  iat: number
  exp: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSessionToken(uid: string, secret: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000)
  const exp = iat + SESSION_MAX_AGE_SECONDS
  const payload = Buffer.from(JSON.stringify({ uid, iat, exp })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowMs: number,
): SessionPayload | null {
  if (!token || !secret) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null

  const payload = token.slice(0, dot)
  const provided = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(payload, secret))

  // timingSafeEqual throws when lengths differ, so check length first.
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  const p = parsed as Partial<SessionPayload>
  if (typeof p?.uid !== 'string' || p.uid.length === 0) return null
  if (typeof p.iat !== 'number' || typeof p.exp !== 'number') return null
  if (p.exp * 1000 <= nowMs) return null

  return { uid: p.uid, iat: p.iat, exp: p.exp }
}
