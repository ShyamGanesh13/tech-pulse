import type { RawArticle } from '../types'

interface DevtoArticle {
  id: number
  title: string
  url: string
  positive_reactions_count: number
  comments_count: number
  user: { username: string }
}

export async function fetchDevto(): Promise<RawArticle[]> {
  const res = await fetch('https://dev.to/api/articles?top=20&per_page=20')
  const articles: DevtoArticle[] = await res.json()
  const now = new Date().toISOString()
  return articles.map(a => ({
    id: `devto:${a.id}`,
    source: 'devto' as const,
    title: a.title,
    url: a.url,
    score: a.positive_reactions_count ?? 0,
    comment_count: a.comments_count ?? 0,
    subreddit: null,
    author: a.user?.username ?? null,
    fetched_at: now,
    topics: [],
  }))
}
