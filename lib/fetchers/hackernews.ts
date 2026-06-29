import type { RawArticle } from '../types'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'

interface HNStory {
  id: number
  title: string
  url?: string
  score: number
  descendants?: number
  by: string
}

export async function fetchHackerNews(): Promise<RawArticle[]> {
  const topIds: number[] = await fetch(`${HN_BASE}/topstories.json`).then(r => r.json())
  const top20 = topIds.slice(0, 20)
  const stories = await Promise.all(
    top20.map(id => fetch(`${HN_BASE}/item/${id}.json`).then(r => r.json()) as Promise<HNStory>)
  )
  const now = new Date().toISOString()
  return stories
    .filter(s => s && s.title)
    .map(s => ({
      id: `hn:${s.id}`,
      source: 'hn' as const,
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score ?? 0,
      comment_count: s.descendants ?? 0,
      subreddit: null,
      author: s.by ?? null,
      fetched_at: now,
    }))
}
