import { NextRequest, NextResponse } from 'next/server'
import { getTransactions, getTransactionSummary, createTransaction, autoCategory } from '@/lib/db'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const month    = sp.get('month')    || undefined
  const category = sp.get('category') || undefined
  const type     = sp.get('type')     || undefined
  const q        = sp.get('q')        || undefined

  const transactions = await getTransactions({ month, category, type, q })
  const summary = month ? await getTransactionSummary(month) : null
  return NextResponse.json({ transactions, summary })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, description, amount, type, source, reference } = body
  const category = body.category || autoCategory(description)
  const txn = await createTransaction({ date, description, amount: Math.abs(Number(amount)), type, category, source: source || 'manual', reference: reference ?? null })
  return NextResponse.json(txn)
}
