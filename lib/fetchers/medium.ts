import Parser from 'rss-parser'
import type { RawArticle } from '../types'

const TAGS = ['programming', 'technology']
const LIMIT_PER_TAG = 15

export async function fetchMedium(): Promise<RawArticle[]> {
  const parser = new Parser()
  const now = new Date().toISOString()
  const results = await Promise.all(
    TAGS.map(async tag => {
      const feed = await parser.parseURL(`https://medium.com/feed/tag/${tag}`)
      return (feed.items ?? []).slice(0, LIMIT_PER_TAG).map(item => ({
        id: `medium:${encodeURIComponent(item.guid ?? item.link ?? item.title ?? tag)}`,
        source: 'medium' as const,
        title: item.title ?? 'Untitled',
        url: item.link ?? '',
        score: 0,
        comment_count: 0,
        subreddit: null,
        author: item.creator ?? null,
        fetched_at: now,
      }))
    })
  )
  const seen = new Set<string>()
  return results.flat().filter(a => {
    if (!a.url || seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
}
