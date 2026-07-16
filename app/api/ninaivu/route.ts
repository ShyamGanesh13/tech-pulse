import { NextRequest, NextResponse } from 'next/server'
import { getNyabagamByDate, createNyabagam } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const nyabagam = await getNyabagamByDate(date)
  return NextResponse.json({ nyabagam })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, description = null, remind_at } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!remind_at || typeof remind_at !== 'string') {
    return NextResponse.json({ error: 'remind_at is required' }, { status: 400 })
  }
  const nyabagam = await createNyabagam(title.trim(), description, remind_at)
  return NextResponse.json({ nyabagam }, { status: 201 })
}
