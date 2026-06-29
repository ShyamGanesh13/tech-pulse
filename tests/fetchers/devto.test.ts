import { describe, it, expect } from 'bun:test'
import { fetchDevto } from '@/lib/fetchers/devto'

describe('fetchDevto', () => {
  it('normalizes Dev.to articles', async () => {
    global.fetch = async () => ({
      json: async () => [
        {
          id: 9001,
          title: 'Why TypeScript is great',
          url: 'https://dev.to/alice/why-typescript',
          positive_reactions_count: 88,
          comments_count: 12,
          user: { username: 'alice' },
        },
        {
          id: 9002,
          title: 'Rust for beginners',
          url: 'https://dev.to/bob/rust',
          positive_reactions_count: 55,
          comments_count: 7,
          user: { username: 'bob' },
        },
      ],
    } as Response)

    const articles = await fetchDevto()
    expect(articles).toHaveLength(2)
    expect(articles[0].id).toBe('devto:9001')
    expect(articles[0].source).toBe('devto')
    expect(articles[0].score).toBe(88)
    expect(articles[0].subreddit).toBeNull()
  })
})
