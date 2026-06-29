import { describe, it, expect, mock } from 'bun:test'
import { fetchMedium } from '@/lib/fetchers/medium'

describe('fetchMedium', () => {
  it('returns deduplicated articles from multiple RSS tags', async () => {
    const mockItems = (tag: string) => ({
      items: Array.from({ length: 3 }, (_, i) => ({
        title: `${tag} article ${i}`,
        link: `https://medium.com/${tag}-${i}`,
        guid: `${tag}-${i}`,
        creator: 'author1',
      })),
    })

    // Mock rss-parser by replacing module — use dynamic import after mocking
    // Since bun:test doesn't support module mocking cleanly for ESM,
    // we test the dedup logic and output shape via a wrapper
    // This test runs against the real module with mocked Parser class
    const Parser = (await import('rss-parser')).default
    const proto = Parser.prototype
    let callCount = 0
    proto.parseURL = async (url: string) => {
      const tag = url.includes('programming') ? 'programming' : 'technology'
      callCount++
      return mockItems(tag)
    }

    const articles = await fetchMedium()
    // 3 per tag × 2 tags = 6, but dedup by URL should keep all 6 (different URLs)
    expect(articles.length).toBe(6)
    expect(articles[0].source).toBe('medium')
    expect(articles[0].subreddit).toBeNull()
    expect(articles[0].score).toBe(0)
  })

  it('deduplicates articles with the same URL across tags', async () => {
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async () => ({
      items: [{ title: 'Same article', link: 'https://medium.com/same', guid: 'same', creator: 'u' }],
    })
    const articles = await fetchMedium()
    expect(articles.length).toBe(1)
  })
})
