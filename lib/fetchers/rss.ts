import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { SOURCES, type Source } from '../source-registry'
import { guidId } from './guid-id'

/**
 * Fetcher for any source that is one plain RSS/Atom feed with nothing to
 * narrow: newest `limit` items, no topic pre-filter. Off-topic items (Techmeme
 * and TechCrunch carry plenty) are left to the post-classification filter in
 * scripts/fetch.ts.
 *
 * Sorted by date before slicing because not every feed is newest-first, and
 * some (OpenAI, Hugging Face) publish their entire archive in one document.
 */
export async function fetchRss(source: Source, url: string, limit = 10): Promise<RawArticle[]> {
  // 15s, not rss-parser's 60s default: one slow feed must not eat the AppSail
  // request budget the whole refresh shares.
  const feed = await new Parser({ timeout: 15_000 }).parseURL(url)
  const now = new Date().toISOString()
  return [...(feed.items ?? [])]
    .sort((a, b) => (b.isoDate ?? '').localeCompare(a.isoDate ?? ''))
    .slice(0, limit)
    .map(item => ({
      id: guidId(source, item.guid ?? item.link ?? item.title ?? ''),
      source,
      title: item.title?.trim() || 'Untitled',
      url: item.link ?? '',
      score: 0,
      comment_count: 0,
      subreddit: null,
      author: item.creator ?? SOURCES[source].label,
      fetched_at: now,
      topics: [],
    }))
}
