import { describe, it, expect } from 'bun:test'
import { fetchReddit } from '@/lib/fetchers/reddit'
import { REDDIT_SUBS } from '@/lib/topic-map'

// Reddit fetcher uses rss-parser (which uses Node http, not global.fetch).
// We test by monkey-patching Parser.prototype.parseURL instead.

const mockFeed = (sub: string) => ({
  items: [
    {
      id: `t3_abc${sub}`,
      title: `Top post in r/${sub}`,
      link: `https://reddit.com/r/${sub}/comments/abc${sub}`,
      author: 'user1',
      creator: 'user1',
    },
  ],
})

describe('fetchReddit', () => {
  it('fetches from all configured AI/ML subreddits', async () => {
    const subsSeen: string[] = []
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async (url: string) => {
      const sub = String(url).match(/\/r\/(\w+)\//)?.[1] ?? 'unknown'
      subsSeen.push(sub)
      return mockFeed(sub)
    }

    const articles = await fetchReddit()
    expect(articles.length).toBe(REDDIT_SUBS.length)
    expect(subsSeen.sort()).toEqual([...REDDIT_SUBS].sort())
    expect(articles.every(a => a.source === 'reddit')).toBe(true)
    expect(articles[0].subreddit).toBeTruthy()
  })

  it('deduplicates articles with the same URL across subreddits', async () => {
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async () => ({
      items: [
        {
          id: 't3_shared',
          title: 'Cross-posted article',
          link: 'https://reddit.com/r/MachineLearning/comments/shared',
          author: 'user1',
        },
      ],
    })
    const articles = await fetchReddit()
    expect(articles.length).toBe(1)
  })
})
