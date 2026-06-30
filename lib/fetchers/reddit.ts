import type { RawArticle } from '../types'

const SUBREDDITS = ['programming', 'MachineLearning', 'webdev']

interface RedditChild {
  data: {
    id: string
    title: string
    url: string
    score: number
    num_comments: number
    author: string
    subreddit: string
    is_self: boolean
  }
}

export async function fetchReddit(): Promise<RawArticle[]> {
  const now = new Date().toISOString()
  const results = await Promise.all(
    SUBREDDITS.map(async sub => {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?t=day&limit=10`,
        { headers: { 'User-Agent': 'tech-pulse/1.0' } }
      )
      const json = await res.json()
      const children: RedditChild[] = json.data?.children ?? []
      return children.map(c => ({
        id: `reddit:${c.data.id}`,
        source: 'reddit' as const,
        title: c.data.title,
        url: c.data.is_self
          ? `https://reddit.com/r/${sub}/comments/${c.data.id}`
          : c.data.url,
        score: c.data.score ?? 0,
        comment_count: c.data.num_comments ?? 0,
        subreddit: c.data.subreddit,
        author: c.data.author ?? null,
        fetched_at: now,
        topics: [],
      }))
    })
  )
  return results.flat()
}
