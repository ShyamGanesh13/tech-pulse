import { NextResponse } from 'next/server'
import { getTransactions, setTransactionCategories } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { categorise, CATEGORIES } from '@/lib/categorise'

/**
 * Re-runs categorisation over the caller's whole history and writes back only
 * the rows whose category actually changes.
 *
 * Needed because categorisation used to be decided per row: the same payee
 * could land in a different bucket every month, and six months of imports
 * carry those inconsistencies. New imports are fixed at parse time; this is
 * how the existing rows catch up.
 *
 * NOTE: this overwrites categories, including any a human picked in the import
 * preview — those are not stored as overrides, so there is nothing here that
 * could tell them apart from a machine guess.
 */
export async function POST() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  try {
    const txns = await getTransactions(userId, {})
    const before = new Map(txns.map(t => [t.id, t.category]))

    await categorise(txns)

    const changed = txns
      .filter(t => before.get(t.id) !== t.category && CATEGORIES.includes(t.category))
      .map(t => ({ id: t.id, category: t.category }))

    const updated = await setTransactionCategories(userId, changed)
    return NextResponse.json({ scanned: txns.length, updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Recategorise error:', msg)
    return NextResponse.json({ error: `Failed to recategorise: ${msg}` }, { status: 500 })
  }
}
