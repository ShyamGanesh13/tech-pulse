import { NextRequest, NextResponse } from 'next/server'
import { getMonthlyTotals } from '@/lib/db'

export async function GET(req: NextRequest) {
  const months = parseInt(req.nextUrl.searchParams.get('months') ?? '6')
  return NextResponse.json(getMonthlyTotals(months))
}
