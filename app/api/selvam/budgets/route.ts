import { NextRequest, NextResponse } from 'next/server'
import { getBudgets, upsertBudget } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  return NextResponse.json(await getBudgets(userId, month))
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { category, amount, month } = await req.json()
  const budget = await upsertBudget(userId, category, Number(amount), month)
  return NextResponse.json(budget)
}
