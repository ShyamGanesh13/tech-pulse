import { NextRequest, NextResponse } from 'next/server'
import { importTransactions } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { transactions } = await req.json()
  const count = await importTransactions(userId, transactions)
  return NextResponse.json({ count })
}
