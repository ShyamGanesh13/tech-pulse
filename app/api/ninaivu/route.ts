import { NextRequest, NextResponse } from 'next/server'
import { getNyabagamByDate, getUpcomingNyabagam, createNyabagam } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const nyabagam = await getNyabagamByDate(userId, date)
  // ?upcoming=<days> also returns reminders landing after `date`, for the
  // "Upcoming" group on today's card.
  const days = parseInt(url.searchParams.get('upcoming') ?? '', 10)
  const upcoming = days > 0 ? await getUpcomingNyabagam(userId, date, days) : []
  return NextResponse.json({ nyabagam, upcoming })
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const body = await req.json()
  const { title, description = null, remind_at } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!remind_at || typeof remind_at !== 'string') {
    return NextResponse.json({ error: 'remind_at is required' }, { status: 400 })
  }
  const nyabagam = await createNyabagam(userId, title.trim(), description, remind_at)
  return NextResponse.json({ nyabagam }, { status: 201 })
}
