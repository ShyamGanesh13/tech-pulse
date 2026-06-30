import { NextRequest, NextResponse } from 'next/server'
import { getBudgets, upsertBudget } from '@/lib/db'

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  return NextResponse.json(await getBudgets(month))
}

export async function POST(req: NextRequest) {
  const { category, amount, month } = await req.json()
  const budget = await upsertBudget(category, Number(amount), month)
  return NextResponse.json(budget)
}
