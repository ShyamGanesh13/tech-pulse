import type { RawArticle } from '../types'
import { SOURCES } from '../source-registry'

const PER_TAG = SOURCES.devto.perTag

interface DevtoArticle {
  id: number
  title: string
  url: string
  positive_reactions_count: number
  comments_count: number
  user: { username: string }
}

/** `tags` comes from resolveTags('devto', enabledTopics) — never the full list. */
export async function fetchDevto(tags: string[]): Promise<RawArticle[]> {
  if (tags.length === 0) return []

  const now = new Date().toISOString()
  const seen = new Set<string>()
  const out: RawArticle[] = []

  // Fetch per requested tag instead of the generic top-20 across all topics.
  const results = await Promise.allSettled(
    tags.map(tag =>
      fetch(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=${PER_TAG}`)
        .then(r => r.json() as Promise<DevtoArticle[]>)
    )
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const a of result.value) {
      if (!a?.id || !a.url || seen.has(a.url)) continue
      seen.add(a.url)
      out.push({
        id: `devto:${a.id}`,
        source: 'devto',
        title: a.title,
        url: a.url,
        score: a.positive_reactions_count ?? 0,
        comment_count: a.comments_count ?? 0,
        subreddit: null,
        author: a.user?.username ?? null,
        fetched_at: now,
        topics: [],
      })
    }
  }

  return out
}
