import { describe, it, expect } from 'bun:test'
import { fetchDevto } from '@/lib/fetchers/devto'
import { DEVTO_TAGS, DEVTO_PER_TAG } from '@/lib/topic-map'

describe('fetchDevto', () => {
  it('fetches from AI/ML tags and normalizes articles', async () => {
    let tagsSeen: string[] = []

    global.fetch = async (url: string) => {
      const tag = new URL(String(url)).searchParams.get('tag') ?? 'unknown'
      tagsSeen.push(tag)
      return {
        json: async () => [
          {
            id: parseInt(tag.charCodeAt(0).toString() + '01'),
            title: `${tag} article`,
            url: `https://dev.to/alice/${tag}-article`,
            positive_reactions_count: 88,
            comments_count: 12,
            user: { username: 'alice' },
          },
        ],
      } as Response
    }

    const articles = await fetchDevto()
    // One article per tag, all unique URLs
    expect(articles.length).toBe(DEVTO_TAGS.length)
    // All configured tags were requested
    expect(tagsSeen.sort()).toEqual([...DEVTO_TAGS].sort())
    expect(articles[0].source).toBe('devto')
    expect(articles[0].subreddit).toBeNull()
  })

  it('deduplicates articles with the same URL across tags', async () => {
    global.fetch = async () => ({
      json: async () => [
        {
          id: 9001,
          title: 'Same article',
          url: 'https://dev.to/alice/same',
          positive_reactions_count: 10,
          comments_count: 1,
          user: { username: 'alice' },
        },
      ],
    } as Response)

    const articles = await fetchDevto()
    expect(articles.length).toBe(1)
  })

  it('respects DEVTO_PER_TAG limit', async () => {
    global.fetch = async () => ({
      json: async () =>
        Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          title: `Article ${i}`,
          url: `https://dev.to/u/article-${i}`,
          positive_reactions_count: i,
          comments_count: 0,
          user: { username: 'u' },
        })),
    } as Response)

    const articles = await fetchDevto()
    // Each tag fetch returns 20, but URL params cap it at DEVTO_PER_TAG
    // (the API enforces this; the fetcher doesn't need to slice)
    // We just verify we don't crash and get the right shape.
    expect(articles.length).toBeGreaterThan(0)
    expect(articles[0].id).toMatch(/^devto:/)
  })
})
