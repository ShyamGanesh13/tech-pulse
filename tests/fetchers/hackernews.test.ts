import { describe, it, expect } from 'bun:test'
import { fetchHackerNews } from '@/lib/fetchers/hackernews'

describe('fetchHackerNews', () => {
  it('returns normalized RawArticle array', async () => {
    const mockStory = {
      id: 12345,
      title: 'Show HN: Something cool',
      url: 'https://example.com',
      score: 342,
      descendants: 87,
      by: 'alice',
    }

    let callCount = 0
    global.fetch = async (url: string) => {
      callCount++
      if (String(url).includes('topstories')) {
        return { json: async () => [12345, 99999] } as Response
      }
      return { json: async () => mockStory } as Response
    }

    const articles = await fetchHackerNews()
    expect(articles.length).toBe(2)
    expect(articles[0].id).toBe('hn:12345')
    expect(articles[0].source).toBe('hn')
    expect(articles[0].title).toBe('Show HN: Something cool')
    expect(articles[0].url).toBe('https://example.com')
    expect(articles[0].score).toBe(342)
    expect(articles[0].comment_count).toBe(87)
    expect(articles[0].subreddit).toBeNull()
  })

  it('falls back to HN item URL when story has no url field', async () => {
    const mockStory = { id: 11111, title: 'Ask HN: something', score: 50, descendants: 20, by: 'bob' }
    global.fetch = async (url: string) => {
      if (String(url).includes('topstories')) return { json: async () => [11111] } as Response
      return { json: async () => mockStory } as Response
    }
    const articles = await fetchHackerNews()
    expect(articles[0].url).toBe('https://news.ycombinator.com/item?id=11111')
  })
})
