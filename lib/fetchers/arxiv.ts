import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { ARXIV_FEEDS, ARXIV_PER_FEED } from '../topic-map'

export async function fetchArxiv(): Promise<RawArticle[]> {
  const parser = new Parser()
  const now = new Date().toISOString()
  const seen = new Set<string>()

  const results = await Promise.allSettled(
    ARXIV_FEEDS.map(url => parser.parseURL(url))
  )

  const out: RawArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const item of (result.value.items ?? []).slice(0, ARXIV_PER_FEED)) {
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
