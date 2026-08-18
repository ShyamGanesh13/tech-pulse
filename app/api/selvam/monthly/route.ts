import { NextRequest, NextResponse } from 'next/server'
import { getMonthlyTotals } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const months = parseInt(req.nextUrl.searchParams.get('months') ?? '6')
  return NextResponse.json(await getMonthlyTotals(userId, months))
}
