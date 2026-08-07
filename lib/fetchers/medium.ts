import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { MEDIUM_TAGS, MEDIUM_PER_TAG } from '../topic-map'

export async function fetchMedium(): Promise<RawArticle[]> {
  const parser = new Parser()
  const now = new Date().toISOString()
  const seen = new Set<string>()

  const results = await Promise.allSettled(
    MEDIUM_TAGS.map(tag =>
      parser.parseURL(`https://medium.com/feed/tag/${tag}`)
    )
  )

  const out: RawArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const item of (result.value.items ?? []).slice(0, MEDIUM_PER_TAG)) {
      if (!item.link || seen.has(item.link)) continue
      seen.add(item.link)
      out.push({
        id: `medium:${encodeURIComponent(item.guid ?? item.link ?? item.title ?? '')}`,
        source: 'medium',
        title: item.title ?? 'Untitled',
        url: item.link,
        score: 0,
        comment_count: 0,
        subreddit: null,
        author: item.creator ?? null,
        fetched_at: now,
        topics: [],
      })
    }
  }

  return out
}
