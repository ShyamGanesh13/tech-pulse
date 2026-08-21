import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { guidId } from './guid-id'

export async function fetchSimonWillison(): Promise<RawArticle[]> {
  const parser = new Parser()
  const feed = await parser.parseURL('https://simonwillison.net/atom/everything/')
  const now = new Date().toISOString()
  return (feed.items ?? []).slice(0, 15).map(item => ({
    id: guidId('simonwillison', item.guid ?? item.link ?? item.title ?? ''),
    source: 'simonwillison' as const,
    title: item.title ?? 'Untitled',
    url: item.link ?? '',
    score: 0,
    comment_count: 0,
    subreddit: null,
    author: item.creator ?? 'Simon Willison',
    fetched_at: now,
    topics: [],
  }))
}
