import { NextRequest, NextResponse } from 'next/server'
import { importTransactions } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { transactions } = await req.json()
  const count = importTransactions(transactions)
  return NextResponse.json({ count })
}
