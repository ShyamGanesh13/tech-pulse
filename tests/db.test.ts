import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { unlinkSync } from 'fs'
import { upsertArticles, getArticles, getSummary, cacheSummary } from '@/lib/db'
import type { RawArticle } from '@/lib/types'

const TEST_DB = '/tmp/tech-pulse-test.db'

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

afterEach(() => {
  try { unlinkSync(TEST_DB) } catch {}
})

describe('db', () => {
  it('upserts and retrieves articles', () => {
    upsertArticles([mockArticle], TEST_DB)
    const articles = getArticles('all', 10, TEST_DB)
    expect(articles).toHaveLength(1)
    expect(articles[0].id).toBe('hn:1')
    expect(articles[0].title).toBe('Test Article')
  })

  it('filters by source', () => {
    const redditArticle: RawArticle = { ...mockArticle, id: 'reddit:1', source: 'reddit' }
    upsertArticles([mockArticle, redditArticle], TEST_DB)
    const hnOnly = getArticles('hn', 10, TEST_DB)
    expect(hnOnly).toHaveLength(1)
    expect(hnOnly[0].source).toBe('hn')
  })

  it('upsert updates score without losing summary', () => {
    upsertArticles([mockArticle], TEST_DB)
    cacheSummary('hn:1', 'A great summary.', TEST_DB)
    upsertArticles([{ ...mockArticle, score: 200 }], TEST_DB)
    const articles = getArticles('all', 10, TEST_DB)
    expect(articles[0].score).toBe(200)
    expect(articles[0].summary).toBe('A great summary.')
  })

  it('getSummary returns null when not cached', () => {
    upsertArticles([mockArticle], TEST_DB)
    expect(getSummary('hn:1', TEST_DB)).toBeNull()
  })

  it('cacheSummary stores and retrieves summary', () => {
    upsertArticles([mockArticle], TEST_DB)
    cacheSummary('hn:1', 'My summary.', TEST_DB)
    expect(getSummary('hn:1', TEST_DB)).toBe('My summary.')
  })
})
