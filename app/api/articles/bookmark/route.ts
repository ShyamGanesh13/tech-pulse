import { NextRequest, NextResponse } from 'next/server'
import { setBookmark, deleteBookmark, getBookmarkedArticles } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const articles = await getBookmarkedArticles()
  return NextResponse.json({ articles })
}

export async function POST(req: NextRequest) {
  const { id, bookmarked } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await setBookmark(id, bookmarked !== false)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await deleteBookmark(id)
  return NextResponse.json({ ok: true })
}
