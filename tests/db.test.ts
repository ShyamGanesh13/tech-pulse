import { describe, it, expect, beforeEach } from 'bun:test'
import {
  upsertArticles, getArticles, getSummary, cacheSummary, clearNonBookmarkedArticles,
} from '@/lib/db'
import type { RawArticle } from '@/lib/types'

// These calls used to pass a TEST_DB path and skip `await` — both left over from
// the better-sqlite3 era. The path argument has been ignored since the libSQL
// port, and every function has been async since; the assertions were silently
// comparing against pending Promises.
const USER = 'test-user-db'

const mockArticle: RawArticle = {
  id: 'hn:1',
  source: 'hn',
  title: 'Test Article',
  url: 'https://example.com/1',
  score: 100,
  comment_count: 10,
  subreddit: null,
  author: 'alice',
  fetched_at: '2026-06-29T08:00:00.000Z',
  topics: [],
}

// Articles are per-tenant, so clearing this user's rows isolates each case.
beforeEach(async () => {
  await clearNonBookmarkedArticles(USER)
})

describe('db', () => {
  it('upserts and retrieves articles', async () => {
    await upsertArticles(USER, [mockArticle])
    const articles = await getArticles(USER, 'all', 10)
    expect(articles).toHaveLength(1)
    expect(articles[0].id).toBe('hn:1')
    expect(articles[0].title).toBe('Test Article')
  })

  it('filters by source', async () => {
    const redditArticle: RawArticle = { ...mockArticle, id: 'reddit:1', source: 'reddit' }
    await upsertArticles(USER, [mockArticle, redditArticle])
    const hnOnly = await getArticles(USER, 'hn', 10)
    expect(hnOnly).toHaveLength(1)
    expect(hnOnly[0].source).toBe('hn')
  })

  it('upsert updates score without losing summary', async () => {
    await upsertArticles(USER, [mockArticle])
    await cacheSummary('hn:1', 'A great summary.')
    await upsertArticles(USER, [{ ...mockArticle, score: 200 }])
    const articles = await getArticles(USER, 'all', 10)
    expect(articles[0].score).toBe(200)
    // Summaries live in their own global table now, so a refresh cannot clobber
    // one — there is no summary column on the article row to overwrite.
    expect(articles[0].summary).toBe('A great summary.')
  })

  it('getSummary returns null when not cached', async () => {
    await upsertArticles(USER, [{ ...mockArticle, id: 'hn:uncached' }])
    expect(await getSummary('hn:uncached')).toBeNull()
  })

  it('cacheSummary stores and retrieves summary', async () => {
    await upsertArticles(USER, [mockArticle])
    await cacheSummary('hn:1', 'My summary.')
    expect(await getSummary('hn:1')).toBe('My summary.')
  })

  it('overwrites an existing cached summary rather than inserting twice', async () => {
    await cacheSummary('hn:1', 'First.')
    await cacheSummary('hn:1', 'Second.')
    expect(await getSummary('hn:1')).toBe('Second.')
  })

  // Summaries are shared across tenants on purpose: an LLM call is paid for once
  // and the next tenant to open the same article inherits it.
  it('shares a cached summary across tenants', async () => {
    const OTHER = 'test-user-db-other'
    await upsertArticles(USER, [{ ...mockArticle, id: 'hn:shared' }])
    await cacheSummary('hn:shared', 'Shared summary.')

    await upsertArticles(OTHER, [{ ...mockArticle, id: 'hn:shared' }])
    const theirs = await getArticles(OTHER, 'all', 10)
    expect(theirs.find(a => a.id === 'hn:shared')?.summary).toBe('Shared summary.')
    await clearNonBookmarkedArticles(OTHER)
  })
})
