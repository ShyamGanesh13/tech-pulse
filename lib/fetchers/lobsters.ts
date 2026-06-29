import type { RawArticle } from '../types'

interface LobstersStory {
  short_id: string
  title: string
  url: string
  score: number
  comment_count: number
  submitter_user: string
}

export async function fetchLobsters(): Promise<RawArticle[]> {
  const res = await fetch('https://lobste.rs/hottest.json', {
    headers: { 'User-Agent': 'tech-pulse/1.0' },
  })
  const stories: LobstersStory[] = await res.json()
  const now = new Date().toISOString()
  return stories.slice(0, 25).filter(s => s?.title).map(s => ({
    id: `lobsters:${s.short_id}`,
    source: 'lobsters' as const,
    title: s.title,
    url: s.url || `https://lobste.rs/s/${s.short_id}`,
    score: s.score ?? 0,
    comment_count: s.comment_count ?? 0,
    subreddit: null,
    author: s.submitter_user ?? null,
    fetched_at: now,
    topics: [],
  }))
}
