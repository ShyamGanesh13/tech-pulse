import Parser from 'rss-parser'
import type { RawArticle } from '../types'

export async function fetchPragmatic(): Promise<RawArticle[]> {
  const parser = new Parser()
  const feed = await parser.parseURL('https://newsletter.pragmaticengineer.com/feed')
  const now = new Date().toISOString()
  return (feed.items ?? []).slice(0, 15).map(item => ({
    id: `pragmatic:${encodeURIComponent(item.guid ?? item.link ?? item.title ?? '')}`,
    source: 'pragmatic' as const,
    title: item.title ?? 'Untitled',
    url: item.link ?? '',
    score: 0,
    comment_count: 0,
    subreddit: null,
    author: item.creator ?? 'Gergely Orosz',
    fetched_at: now,
    topics: [],
  }))
}
