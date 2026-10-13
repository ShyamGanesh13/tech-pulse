import { NextRequest, NextResponse } from 'next/server'
import { importTransactions } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  try {
    const { transactions } = await req.json()
    const count = await importTransactions(userId, transactions)
    return NextResponse.json({ count })
  } catch (err) {
    // Without this the route answered a bare 500 with no body, so the client's
    // `data.error` was undefined and the UI showed its generic fallback.
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Transaction import error:', msg)
    return NextResponse.json({ error: `Failed to import: ${msg}` }, { status: 500 })
  }
}
