import { NextRequest, NextResponse } from 'next/server'
import { getDatesWithReminders } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const url = new URL(req.url)
  const year = parseInt(url.searchParams.get('year') ?? '', 10)
  const month = parseInt(url.searchParams.get('month') ?? '', 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'valid year and month (1-12) required' }, { status: 400 })
  }
  const days = getDatesWithReminders(year, month)
  return NextResponse.json({ days })
}
