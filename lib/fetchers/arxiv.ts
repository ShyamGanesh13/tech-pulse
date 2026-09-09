import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { SOURCES } from '../source-registry'

const PER_FEED = SOURCES.arxiv.perTag

/**
 * `feeds` comes from resolveTags('arxiv', enabledTopics). arXiv's registry
 * entries are full RSS category URLs rather than bare tags, so they are used
 * verbatim.
 */
export async function fetchArxiv(feeds: string[]): Promise<RawArticle[]> {
  if (feeds.length === 0) return []
  const parser = new Parser()
  const now = new Date().toISOString()
  const seen = new Set<string>()

  const results = await Promise.allSettled(
    feeds.map(url => parser.parseURL(url))
  )

  const out: RawArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const item of (result.value.items ?? []).slice(0, PER_FEED)) {
      const link = item.link ?? ''
      const arxivId = link
        .replace('https://arxiv.org/abs/', '')
        .replace('http://arxiv.org/abs/', '')
        .split('v')[0]
      if (!arxivId || seen.has(arxivId)) continue
      seen.add(arxivId)
      out.push({
        id: `arxiv:${arxivId}`,
        source: 'arxiv',
        title: (item.title ?? 'Untitled').replace(/\n/g, ' ').trim(),
        url: link || `https://arxiv.org/abs/${arxivId}`,
        score: 0,
        comment_count: 0,
        subreddit: null,
        author: item.creator ?? item.author ?? null,
        fetched_at: now,
        topics: [],
      })
    }
  }

  return out
}
