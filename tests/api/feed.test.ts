import { describe, it, expect, beforeEach, mock } from 'bun:test'

// The feed route resolves the caller through lib/auth, which reads cookies() —
// unavailable when a handler is invoked directly outside a request scope. Stub
// the DAL so this stays a test of the route's own logic.
const USER = 'test-user-feed'

mock.module('@/lib/auth', () => ({
  getUserIdOrNull: async () => USER,
  unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  SESSION_COOKIE: 'tp_session',
}))

const { upsertArticles, clearNonBookmarkedArticles, setFeedPrefs } = await import('@/lib/db')
const { GET } = await import('@/app/api/feed/route')
import type { RawArticle } from '@/lib/types'

function article(over: Partial<RawArticle> & Pick<RawArticle, 'id'>): RawArticle {
  return {
    source: 'hn',
    title: 'Test Post',
    url: `https://example.com/${over.id}`,
    score: 10,
    comment_count: 0,
    subreddit: null,
    author: null,
    fetched_at: new Date().toISOString(),
    topics: [],
    ...over,
  }
}

// Articles are per-tenant now, so wiping this user's rows isolates each case
// without touching anything another test file wrote.
beforeEach(async () => {
  await clearNonBookmarkedArticles(USER)
  await setFeedPrefs(USER, {
    sources: ['hn', 'reddit', 'devto', 'medium'],
    topics: ['AI', 'LLMs', 'Machine Learning'],
  })
})

describe('GET /api/feed', () => {
  it('returns 400 for invalid source', async () => {
    const res = await GET(new Request('http://localhost/api/feed?source=invalid') as never)
    expect(res.status).toBe(400)
  })

  // 'toString' is on Object.prototype, so a naive `source in SOURCES` check
  // would wave it through into the query.
  it('returns 400 for a prototype key posing as a source', async () => {
    const res = await GET(new Request('http://localhost/api/feed?source=toString') as never)
    expect(res.status).toBe(400)
  })

  it('accepts valid source values', async () => {
    for (const source of ['all', 'hn', 'reddit', 'devto', 'medium']) {
      const res = await GET(new Request(`http://localhost/api/feed?source=${source}`) as never)
      expect(res.status).toBe(200)
      expect(Array.isArray((await res.json()).articles)).toBe(true)
    }
  })

  it('filters by topics when ?topics= is provided', async () => {
    await upsertArticles(USER, [
      article({ id: 'hn:topic1', title: 'AI news', topics: ['AI'] }),
      article({ id: 'hn:topic2', title: 'JS news', topics: [] }),
    ])

    const res = await GET(new Request('http://localhost/api/feed?topics=AI') as never)
    const data = await res.json()
    expect(data.articles.length).toBe(1)
    expect(data.articles[0].id).toBe('hn:topic1')
  })

  // Disabling a source has to take effect immediately, not on the next refresh:
  // rows fetched under the old subscription are still sitting in the table.
  it('hides rows from a source the tenant has switched off', async () => {
    await upsertArticles(USER, [
      article({ id: 'hn:kept', source: 'hn', topics: ['AI'] }),
      article({ id: 'lobsters:gone', source: 'lobsters', topics: ['AI'] }),
    ])

    const res = await GET(new Request('http://localhost/api/feed?source=all') as never)
    const ids = (await res.json()).articles.map((a: { id: string }) => a.id)
    expect(ids).toContain('hn:kept')
    expect(ids).not.toContain('lobsters:gone')
  })

  it('returns nothing when the requested source is not subscribed', async () => {
    await upsertArticles(USER, [article({ id: 'lobsters:x', source: 'lobsters', topics: ['AI'] })])

    const res = await GET(new Request('http://localhost/api/feed?source=lobsters') as never)
    expect(res.status).toBe(200)
    expect((await res.json()).articles).toEqual([])
  })

  it('hides rows whose only topics are switched off', async () => {
    await upsertArticles(USER, [
      article({ id: 'hn:on', topics: ['LLMs'] }),
      article({ id: 'hn:off', topics: ['Data Science'] }),
    ])

    const res = await GET(new Request('http://localhost/api/feed?source=all') as never)
    const ids = (await res.json()).articles.map((a: { id: string }) => a.id)
    expect(ids).toContain('hn:on')
    expect(ids).not.toContain('hn:off')
  })

  // THE IMPORTANT ONE. During a classifier outage the fetch deliberately keeps
  // articles it could not tag (commit 931395f) and the UI dims them. If the read
  // path dropped untagged articles, that fix would be undone here and a
  // model-host outage would show an empty feed instead of a degraded one.
  it('keeps untagged articles so a classifier outage degrades rather than empties', async () => {
    await upsertArticles(USER, [article({ id: 'hn:untagged', topics: [] })])

    const res = await GET(new Request('http://localhost/api/feed?source=all') as never)
    const ids = (await res.json()).articles.map((a: { id: string }) => a.id)
    expect(ids).toContain('hn:untagged')
  })

  it('intersects an explicit topic filter with the subscription', async () => {
    await upsertArticles(USER, [article({ id: 'hn:ds', topics: ['Data Science'] })])

    // Data Science is not subscribed, so asking for it yields nothing rather
    // than bypassing the preference.
    const res = await GET(new Request('http://localhost/api/feed?topics=Data%20Science') as never)
    expect((await res.json()).articles).toEqual([])
  })
})
