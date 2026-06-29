import { NextRequest, NextResponse } from 'next/server'
import { getArticles, getArticlesByTopics } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest, dbPath?: string) {
  const url = new URL(req.url)
  const source = url.searchParams.get('source') ?? 'all'
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const topicsParam = url.searchParams.get('topics')
  const topics = topicsParam ? topicsParam.split(',').map(t => t.trim()).filter(Boolean) : []

  const validSources = ['all', 'hn', 'reddit', 'devto', 'medium', 'huggingface', 'arxiv', 'lobsters', 'pragmatic']
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const safeLimit = isNaN(limit) ? 100 : limit
  const articles = topics.length > 0
    ? getArticlesByTopics(topics, source, safeLimit, dbPath)
    : getArticles(source, safeLimit, dbPath)
  return NextResponse.json({ articles })
}
