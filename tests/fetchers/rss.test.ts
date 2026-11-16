import { describe, it, expect } from 'bun:test'
import { fetchRss } from '@/lib/fetchers/rss'

describe('fetchRss', () => {
  it('keeps the newest `limit` items regardless of feed order', async () => {
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async () => ({
      items: [
        { title: 'old', link: 'https://x/old', guid: 'old', isoDate: '2026-01-01T00:00:00.000Z' },
        { title: ' newest ', link: 'https://x/new', guid: 'new', isoDate: '2026-11-15T00:00:00.000Z' },
        { title: 'middle', link: 'https://x/mid', guid: 'mid', isoDate: '2026-06-01T00:00:00.000Z' },
      ],
    })

    const articles = await fetchRss('openai', 'https://example.test/feed', 2)
    expect(articles.map(a => a.title)).toEqual(['newest', 'middle'])
    expect(articles[0].source).toBe('openai')
    expect(articles[0].id).toMatch(/^openai:[0-9a-f]{32}$/)
    // No byline in the feed → the source's own label.
    expect(articles[0].author).toBe('OpenAI News')
  })
})
