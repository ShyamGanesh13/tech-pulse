import { NextRequest, NextResponse } from 'next/server'
import { getPathivu, getPathivuRange, getPathivuDates, savePathivu } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { istDate } from '@/lib/pathivu'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

/**
 * ?date=YYYY-MM-DD  — that day's entry (null when the day is blank)
 * ?month=YYYY-MM    — the days in that month that have an entry, for the picker
 * ?from=&to=        — entries across a range, used by the report view
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  if (month) {
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    const [y, m] = month.split('-').map(Number)
    return NextResponse.json({ days: await getPathivuDates(userId, y, m) })
  }

  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (from && to) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
    }
    return NextResponse.json({ entries: await getPathivuRange(userId, from, to) })
  }

  const date = url.searchParams.get('date') ?? istDate()
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  return NextResponse.json({ entry: await getPathivu(userId, date), date })
}

/**
 * Saves the day. `content` is the whole edited entry and replaces what is
 * stored; `raw_transcript`, when present, is appended to the day's dictation
 * record rather than replacing it.
 *
 * Any past day is writable, which is the point — the entry is meant to be
 * reopened and extended. A future date is not: it would silently create a day
 * that has not happened.
 */
export async function PUT(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  let body: { entry_date?: string; content?: string; raw_transcript?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const entryDate = body.entry_date ?? istDate()
  if (!DATE_RE.test(entryDate)) return NextResponse.json({ error: 'entry_date must be YYYY-MM-DD' }, { status: 400 })
  if (entryDate > istDate()) return NextResponse.json({ error: 'cannot write an entry for a future day' }, { status: 400 })
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'content is required' }, { status: 400 })

  try {
    const entry = await savePathivu(userId, entryDate, body.content, body.raw_transcript ?? null)
    return NextResponse.json({ entry })
  } catch (err) {
    // The Catalyst adapter refuses an over-long entry rather than letting the
    // 10000-char column truncate it silently; surface that as a real message.
    const msg = err instanceof Error ? err.message : 'save failed'
    if (msg.includes('truncate')) return NextResponse.json({ error: msg }, { status: 413 })
    throw err
  }
}
