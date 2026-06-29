import { describe, it, expect } from 'bun:test'
import type { RawArticle, Article, Source } from '@/lib/types'

describe('types', () => {
  it('RawArticle has required fields', () => {
    const a: RawArticle = {
      id: 'hn:12345',
      source: 'hn',
      title: 'Test',
      url: 'https://example.com',
      score: 100,
      comment_count: 10,
      subreddit: null,
      author: 'user',
      fetched_at: new Date().toISOString(),
    }
    expect(a.id).toBe('hn:12345')
    expect(a.source).toBe('hn')
  })

  it('Article extends RawArticle with nullable summary', () => {
    const a: Article = {
      id: 'hn:12345',
      source: 'hn',
      title: 'Test',
      url: 'https://example.com',
      score: 100,
      comment_count: 10,
      subreddit: null,
      author: 'user',
      fetched_at: new Date().toISOString(),
      summary: null,
    }
    expect(a.summary).toBeNull()
  })
})
