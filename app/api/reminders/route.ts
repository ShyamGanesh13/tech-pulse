import { NextRequest, NextResponse } from 'next/server'
import { getRemindersByDate, createReminder } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const reminders = getRemindersByDate(date)
  return NextResponse.json({ reminders })
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
  const reminder = createReminder(title.trim(), description, remind_at)
  return NextResponse.json({ reminder }, { status: 201 })
}
