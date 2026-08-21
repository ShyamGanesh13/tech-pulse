import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { guidId } from './guid-id'

export async function fetchGithubBlog(): Promise<RawArticle[]> {
  const parser = new Parser()
  // The AI & ML category feed, not the firehose /feed/ — that one is mostly
  // Actions/security/release announcements unrelated to our interest areas.
  const feed = await parser.parseURL('https://github.blog/ai-and-ml/feed/')
  const now = new Date().toISOString()
  return (feed.items ?? []).slice(0, 15).map(item => ({
    id: guidId('githubblog', item.guid ?? item.link ?? item.title ?? ''),
    source: 'githubblog' as const,
    title: item.title ?? 'Untitled',
    url: item.link ?? '',
    score: 0,
    comment_count: 0,
    subreddit: null,
    author: item.creator ?? 'GitHub Blog',
    fetched_at: now,
    topics: [],
  }))
}
