import Parser from 'rss-parser'
import type { RawArticle } from '../types'

const FEEDS = [
  'https://export.arxiv.org/rss/cs.AI',
  'https://export.arxiv.org/rss/cs.LG',
]
const LIMIT_PER_FEED = 15

export async function fetchArxiv(): Promise<RawArticle[]> {
  const parser = new Parser()
  const now = new Date().toISOString()
  const results = await Promise.all(
    FEEDS.map(async url => {
      const feed = await parser.parseURL(url)
      return (feed.items ?? []).slice(0, LIMIT_PER_FEED).map(item => {
        const link = item.link ?? ''
        const arxivId = link.replace('https://arxiv.org/abs/', '').replace('http://arxiv.org/abs/', '').split('v')[0]
        return {
          id: `arxiv:${arxivId}`,
          source: 'arxiv' as const,
          title: (item.title ?? 'Untitled').replace(/\n/g, ' ').trim(),
          url: link || `https://arxiv.org/abs/${arxivId}`,
          score: 0,
          comment_count: 0,
          subreddit: null,
          author: item.creator ?? item.author ?? null,
          fetched_at: now,
          topics: [],
        }
      })
    })
  )
  const seen = new Set<string>()
  return results.flat().filter(a => {
    if (!a.id || seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}
