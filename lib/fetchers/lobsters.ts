import type { RawArticle } from '../types'
import { matchesTopics } from '../topic-map'

interface LobstersStory {
  short_id: string
  title: string
  url: string
  score: number
  comment_count: number
  submitter_user: string
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export async function fetchLobsters(): Promise<RawArticle[]> {
  const res = await fetch('https://lobste.rs/hottest.json', {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`lobsters: ${res.status} ${res.statusText}`)
  const stories: LobstersStory[] = await res.json()
  const now = new Date().toISOString()

  return stories
    .filter(s => s?.title && matchesTopics(s.title))
    .map(s => ({
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
