import { describe, it, expect } from 'bun:test'
import { createSessionToken, verifySessionToken, SESSION_MAX_AGE_SECONDS } from '@/lib/session'

const SECRET = 'test-secret-value'
const NOW = 1_800_000_000_000 // fixed ms timestamp

describe('session token', () => {
  it('round-trips a uid', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    const p = verifySessionToken(t, SECRET, NOW)
    expect(p?.uid).toBe('user-abc')
  })

  it('sets exp to iat plus the max age', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    const p = verifySessionToken(t, SECRET, NOW)
    expect(p!.exp - p!.iat).toBe(SESSION_MAX_AGE_SECONDS)
  })

  it('rejects a token signed with a different secret', () => {
    const t = createSessionToken('user-abc', 'other-secret', NOW)
    expect(verifySessionToken(t, SECRET, NOW)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: 'user-evil', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url')
    const forged = `${forgedPayload}.${t.slice(t.lastIndexOf('.') + 1)}`
    expect(verifySessionToken(forged, SECRET, NOW)).toBeNull()
  })

  it('rejects an expired token', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    const later = NOW + (SESSION_MAX_AGE_SECONDS + 1) * 1000
    expect(verifySessionToken(t, SECRET, later)).toBeNull()
  })

  it('rejects undefined, empty, and malformed tokens', () => {
    expect(verifySessionToken(undefined, SECRET, NOW)).toBeNull()
    expect(verifySessionToken('', SECRET, NOW)).toBeNull()
    expect(verifySessionToken('no-dot-here', SECRET, NOW)).toBeNull()
    expect(verifySessionToken('.onlysig', SECRET, NOW)).toBeNull()
    expect(verifySessionToken('abc.', SECRET, NOW)).toBeNull()
  })

  it('rejects a signature of a different length without throwing', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    const short = `${t.slice(0, t.lastIndexOf('.'))}.abc`
    expect(verifySessionToken(short, SECRET, NOW)).toBeNull()
  })

  it('rejects an empty secret', () => {
    const t = createSessionToken('user-abc', SECRET, NOW)
    expect(verifySessionToken(t, '', NOW)).toBeNull()
  })
})
