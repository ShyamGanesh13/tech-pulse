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
  // fetch() + parseString, NOT parser.parseURL: rss-parser's own HTTP client
  // never decompresses, and deepmind.google answered AppSail with a body it
  // could not read ("Non-whitespace before first tag") while the same URL
  // parsed fine locally. fetch() negotiates and decodes gzip/br itself.
  // 15s cap: one slow feed must not eat the AppSail request budget the whole
  // refresh shares.
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; feed-reader)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`${source}: ${res.status} ${res.statusText}`)
  const feed = await new Parser().parseString(await res.text())
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
