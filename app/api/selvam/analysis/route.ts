import { NextResponse } from 'next/server'
import { getTransactions } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { analyse } from '@/lib/finance-analysis'

/**
 * Every derived view on the Analytics screen, from one pass over the caller's
 * history. The read is paged (see pagedZcql) because these are whole-history
 * aggregates, and a truncated history produces plausible, wrong numbers.
 */
export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  try {
    const txns = await getTransactions(userId, {})
    const today = new Date().toISOString().slice(0, 10)
    return NextResponse.json({ ...analyse(txns, today), rows: txns.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Analysis error:', msg)
    return NextResponse.json({ error: `Failed to analyse: ${msg}` }, { status: 500 })
  }
}
