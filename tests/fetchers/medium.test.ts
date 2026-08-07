import { describe, it, expect } from 'bun:test'
import { fetchMedium } from '@/lib/fetchers/medium'
import { MEDIUM_TAGS } from '@/lib/topic-map'

describe('fetchMedium', () => {
  it('returns deduplicated articles from all AI/ML tags', async () => {
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async (url: string) => {
      const tag = url.split('/tag/')[1] ?? 'unknown'
      return {
        items: Array.from({ length: 3 }, (_, i) => ({
          title: `${tag} article ${i}`,
          link: `https://medium.com/${tag}-${i}`,
          guid: `${tag}-${i}`,
          creator: 'author1',
        })),
      }
    }

    const articles = await fetchMedium()
    // 3 per tag × number of tags (all different URLs → no dedup expected)
    expect(articles.length).toBe(3 * MEDIUM_TAGS.length)
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
