import { NextRequest, NextResponse } from 'next/server'
import { getDatesWithNyabagam, getDatesWithTodos } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const year = parseInt(url.searchParams.get('year') ?? '', 10)
  const month = parseInt(url.searchParams.get('month') ?? '', 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'valid year and month (1-12) required' }, { status: 400 })
  }
  const [reminderDays, todoDays] = await Promise.all([
    getDatesWithNyabagam(userId, year, month),
    getDatesWithTodos(userId, year, month),
  ])
  const days = [...new Set([...reminderDays, ...todoDays])].sort((a, b) => a - b)
  return NextResponse.json({ days })
}
