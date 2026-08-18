import { NextRequest, NextResponse } from 'next/server'
import { setBookmark, deleteBookmark, getBookmarkedArticles } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const articles = await getBookmarkedArticles(userId)
  return NextResponse.json({ articles })
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id, bookmarked } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await setBookmark(userId, id, bookmarked !== false)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await deleteBookmark(userId, id)
  return NextResponse.json({ ok: true })
}
