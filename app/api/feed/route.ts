import { NextRequest, NextResponse } from 'next/server'
import { getArticles } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') ?? 'all'
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  const validSources = ['all', 'hn', 'reddit', 'devto', 'medium']
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const articles = getArticles(source, isNaN(limit) ? 100 : limit)
  return NextResponse.json({ articles })
}
