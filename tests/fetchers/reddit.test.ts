import { describe, it, expect } from 'bun:test'
import { fetchReddit } from '@/lib/fetchers/reddit'

const mockRedditResponse = (sub: string) => ({
  data: {
    children: [
      {
        data: {
          id: `abc${sub}`,
          title: `Top post in ${sub}`,
          url: `https://example.com/${sub}`,
          score: 500,
          num_comments: 42,
          author: 'user1',
          subreddit: sub,
          is_self: false,
          selftext: '',
        },
      },
    ],
  },
})

describe('fetchReddit', () => {
  it('fetches from 3 subreddits and normalizes articles', async () => {
    global.fetch = async (url: string) => {
      const sub = String(url).match(/\/r\/(\w+)\//)?.[1] ?? 'unknown'
      return { json: async () => mockRedditResponse(sub) } as Response
    }

    const articles = await fetchReddit()
    expect(articles.length).toBe(3)
    const sources = articles.map(a => a.source)
    expect(sources.every(s => s === 'reddit')).toBe(true)
    expect(articles[0].subreddit).toBeTruthy()
  })

  it('uses self-post URL for text posts', async () => {
    global.fetch = async (url: string) => {
      const sub = String(url).match(/\/r\/(\w+)\//)?.[1] ?? 'programming'
      return {
        json: async () => ({
          data: {
            children: [{
              data: {
                id: 'selfpost1',
                title: 'Ask r/programming: what is X?',
                url: 'https://reddit.com/r/programming/comments/selfpost1',
                score: 10,
                num_comments: 5,
                author: 'user2',
                subreddit: sub,
                is_self: true,
                selftext: 'some text',
              },
            }],
          },
        }),
      } as Response
    }
    const articles = await fetchReddit()
    expect(articles[0].url).toContain('reddit.com')
  })
})
