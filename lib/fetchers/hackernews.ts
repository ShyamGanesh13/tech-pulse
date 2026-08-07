import type { RawArticle } from '../types'
import { matchesTopics } from '../topic-map'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'

interface HNStory {
  id: number
  title: string
  url?: string
  score: number
  descendants?: number
  by: string
  time?: number
}

export async function fetchHackerNews(): Promise<RawArticle[]> {
  // beststories ranks by community upvotes over time — higher signal-to-noise
  // than topstories (which mixes new and highly-voted).
  const ids: number[] = await fetch(`${HN_BASE}/beststories.json`).then(r => r.json())
  const top60 = ids.slice(0, 60)

  const stories = await Promise.all(
    top60.map(id => fetch(`${HN_BASE}/item/${id}.json`).then(r => r.json()) as Promise<HNStory>)
  )

  return stories
    .filter(s => s?.title && matchesTopics(s.title))
    .map(s => ({
      id: `hn:${s.id}`,
      source: 'hn' as const,
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score ?? 0,
      comment_count: s.descendants ?? 0,
      subreddit: null,
      author: s.by ?? null,
      fetched_at: s.time ? new Date(s.time * 1000).toISOString() : new Date().toISOString(),
      topics: [],
    }))
}
