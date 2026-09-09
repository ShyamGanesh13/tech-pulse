import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { guidId } from './guid-id'
import { SOURCES } from '../source-registry'

const PER_TAG = SOURCES.medium.perTag

/** `tags` comes from resolveTags('medium', enabledTopics) — never the full list. */
export async function fetchMedium(tags: string[]): Promise<RawArticle[]> {
  if (tags.length === 0) return []
  const parser = new Parser()
  const now = new Date().toISOString()
  const seen = new Set<string>()

  const results = await Promise.allSettled(
    tags.map(tag =>
      parser.parseURL(`https://medium.com/feed/tag/${tag}`)
    )
  )

  const out: RawArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const item of (result.value.items ?? []).slice(0, PER_TAG)) {
      if (!item.link) continue
      // Dedupe on the ID, not the link. One Medium post appears in several tag
      // feeds with the same guid but links that differ by tracking query params,
      // so deduping on link let the same article through more than once — which
      // the datastore rejects outright (409 DUPLICATE_VALUE) rather than merging.
      const id = guidId('medium', item.guid ?? item.link ?? item.title ?? '')
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
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
