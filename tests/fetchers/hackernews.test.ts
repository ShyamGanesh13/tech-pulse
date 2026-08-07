import { describe, it, expect } from 'bun:test'
import { fetchHackerNews } from '@/lib/fetchers/hackernews'

const AI_TITLE = 'Show HN: LLM fine-tuning guide'
const OFF_TOPIC = 'Ask HN: Best restaurants in Paris'

describe('fetchHackerNews', () => {
  it('fetches from beststories and returns normalized articles', async () => {
    const mockStory = {
      id: 12345,
      title: AI_TITLE,
      url: 'https://example.com',
      score: 342,
      descendants: 87,
      by: 'alice',
    }

    global.fetch = async (url: string) => {
      if (String(url).includes('beststories')) {
        return { json: async () => [12345] } as Response
      }
      return { json: async () => mockStory } as Response
    }

    const articles = await fetchHackerNews()
    expect(articles.length).toBe(1)
    expect(articles[0].id).toBe('hn:12345')
    expect(articles[0].source).toBe('hn')
    expect(articles[0].score).toBe(342)
    expect(articles[0].comment_count).toBe(87)
    expect(articles[0].subreddit).toBeNull()
  })

  it('filters out off-topic stories before classifying', async () => {
    const stories: Record<number, { id: number; title: string; score: number; by: string }> = {
      1: { id: 1, title: AI_TITLE, score: 200, by: 'alice' },
      2: { id: 2, title: OFF_TOPIC, score: 150, by: 'bob' },
      3: { id: 3, title: 'New GPT-5 benchmark results', score: 300, by: 'carol' },
    }

    global.fetch = async (url: string) => {
      if (String(url).includes('beststories')) {
        return { json: async () => [1, 2, 3] } as Response
      }
      const id = parseInt(String(url).match(/\/item\/(\d+)/)?.[1] ?? '0')
      return { json: async () => stories[id] } as Response
    }

    const articles = await fetchHackerNews()
    // Off-topic story should be dropped
    expect(articles.length).toBe(2)
    expect(articles.every(a => a.title !== OFF_TOPIC)).toBe(true)
  })

  it('falls back to HN item URL when story has no url field', async () => {
    const mockStory = { id: 11111, title: 'New LLM architecture explained', score: 50, descendants: 20, by: 'bob' }
    global.fetch = async (url: string) => {
      if (String(url).includes('beststories')) return { json: async () => [11111] } as Response
      return { json: async () => mockStory } as Response
    }
    const articles = await fetchHackerNews()
    expect(articles[0].url).toBe('https://news.ycombinator.com/item?id=11111')
  })
})
