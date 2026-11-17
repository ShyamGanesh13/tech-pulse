import { NextRequest, NextResponse } from 'next/server'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { searchArticles } from '@/lib/article-search'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ articles: [] })

  return NextResponse.json(await searchArticles(userId, q))
}
