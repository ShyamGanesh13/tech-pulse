import { describe, it, expect, afterEach } from 'bun:test'
import { unlinkSync } from 'fs'
import { upsertArticles } from '@/lib/db'
import { GET } from '@/app/api/feed/route'
import type { RawArticle } from '@/lib/types'

const TEST_DB = '/tmp/tech-pulse-feed-test.db'

// Patch the db module to use test DB path for this test
// We test the handler by calling it directly with a mock request
const mockArticle: RawArticle = {
  id: 'hn:42',
  source: 'hn',
  title: 'Test HN Post',
  url: 'https://example.com',
  score: 99,
  comment_count: 5,
  subreddit: null,
  author: 'alice',
  fetched_at: '2026-06-29T08:00:00.000Z',
  topics: [],
}

afterEach(() => {
  try { unlinkSync(TEST_DB) } catch {}
})

describe('GET /api/feed', () => {
  it('returns 400 for invalid source', async () => {
    const req = new Request('http://localhost/api/feed?source=invalid')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('accepts valid source values', async () => {
    for (const source of ['all', 'hn', 'reddit', 'devto', 'medium']) {
      const req = new Request(`http://localhost/api/feed?source=${source}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.articles)).toBe(true)
    }
  })

  it('filters by topics when ?topics= param provided', async () => {
    upsertArticles([
      { id: 'hn:topic1', source: 'hn', title: 'AI news', url: 'https://example.com/1',
        score: 10, comment_count: 0, subreddit: null, author: null,
        fetched_at: new Date().toISOString(), topics: ['AI'] },
      { id: 'hn:topic2', source: 'hn', title: 'JS news', url: 'https://example.com/2',
        score: 5, comment_count: 0, subreddit: null, author: null,
        fetched_at: new Date().toISOString(), topics: [] }
    ], TEST_DB)

    const req = new Request('http://localhost/api/feed?topics=AI', { method: 'GET' })
    const res = await GET(req as any, TEST_DB)
    const data = await res.json()
    expect(data.articles.length).toBe(1)
    expect(data.articles[0].id).toBe('hn:topic1')
  })
})
