import { describe, it, expect } from 'bun:test'
import { buildDigest } from '@/lib/digest'
import { GET } from '@/app/api/thagaval/digest/route'

const a = (id: string, source: string, title: string, topics = ['AI'], relevance = 1) =>
  ({ id, source: source as never, title, url: `https://example.com/${id}`, topics, relevance, score: 0 })

describe('buildDigest', () => {
  it('lists the top stories, most-covered first, truncating long titles', () => {
    const long = 'A very long headline about a model that goes on and on well past what a notification can show'
    const out = buildDigest([
      a('1', 'arxiv', long, ['AI'], 9),
      a('2', 'hn', 'Acme ships Widget 9000 quantum chip'),
      a('3', 'techcrunch', 'Acme ships Widget 9000 quantum chip today'),
      a('4', 'hn', 'Off-topic gardening post', []),
      a('5', 'tldrai', 'Digest: five unrelated things', ['AI'], 20),
    ], '2026-11-16')!

    expect(out.title).toBe('Thagaval — top stories')
    expect(out.url).toBe('/thagaval')
    expect(out.tag).toBe('thagaval-digest-2026-11-16')
    const lines = out.body.split('\n')
    // Two sources ran the Acme story, so it leads despite lower relevance; the
    // duplicate, the untagged post and the digest source are all absent.
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('• Acme ships Widget 9000 quantum chip')
    expect(lines[1].endsWith('…')).toBe(true)
    expect(lines[1].length).toBeLessThanOrEqual(72)
  })

  it('caps the list at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => a(`n${i}`, 'hn', `Unrelated subject number${i} alpha${i} beta${i}`))
    expect(buildDigest(many)!.body.split('\n')).toHaveLength(5)
  })

  it('returns null when nothing is on-topic, so the user is skipped', () => {
    expect(buildDigest([a('1', 'hn', 'Untagged', [])])).toBeNull()
    expect(buildDigest([])).toBeNull()
  })
})

describe('GET /api/thagaval/digest auth', () => {
  const call = (headers: Record<string, string> = {}) =>
    GET(new Request('http://localhost/api/thagaval/digest', { headers }) as never)

  async function withSecret(value: string | undefined, fn: () => Promise<void>) {
    const prev = process.env.CRON_SECRET
    if (value === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = value
    try { await fn() } finally {
      if (prev === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prev
    }
  }

  it('refuses to run with no CRON_SECRET configured', () =>
    withSecret(undefined, async () => { expect((await call()).status).toBe(503) }))

  it('rejects a missing or wrong bearer token', () =>
    withSecret('test-secret', async () => {
      expect((await call()).status).toBe(401)
      expect((await call({ authorization: 'Bearer nope' })).status).toBe(401)
      expect((await call({ authorization: 'test-secret' })).status).toBe(401)
    }))
})
