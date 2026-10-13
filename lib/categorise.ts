// How a transaction gets its category. One decision per PAYEE, not per row.
//
// Per-row categorisation is what put the same payee in four different buckets
// across six months of real data — SKYMARK SU landed in Shopping, Food &
// Dining, Transport and Other; ZOHO CORPORATION alternated between Shopping and
// Other. Keywords miss these names, so each row fell through to the LLM, which
// decides in batches of 15 with no knowledge of the other batches. Grouping
// first makes consistency structural rather than lucky, and sends ~40 payees to
// the model instead of 356 rows.
import { aiCategorize } from './ai-categorize'
import { CATEGORIES } from './categories'
import { keywordCategory } from './category-keywords'
import { payeeKey } from './finance-analysis'

export { CATEGORIES }

export interface Categorisable {
  description: string
  /**
   * Extra text to match on, when the parser has more than it can show. A bank
   * UPI remark carries the handle (`swiggy@icici`) alongside a display name
   * that may name nobody recognisable; the handle is often the only thing a
   * keyword can catch. Never stored — the import only reads the known columns.
   */
  catText?: string
  type: 'debit' | 'credit' | string
  category?: string
}

/**
 * Assigns a category to every row, deciding once per payee.
 *
 * Credits never go through the keywords or the model: money coming in is
 * Income. Nothing downstream sums credits into spending, so this is about the
 * row reading correctly — a ₹76,289 salary credit labelled "Shopping" was the
 * most visible symptom of the per-row approach.
 */
export async function categorise<T extends Categorisable>(rows: T[]): Promise<T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    if (row.type === 'credit') {
      row.category = 'Income'
      continue
    }
    // Key on the payee, but keep every description the payee ever carried: the
    // narration holds the purpose ("Gas Bill — Mr RISHI K") while the payee
    // alone would not match a single keyword.
    const key = payeeKey(row.description) || row.description.toLowerCase()
    const g = groups.get(key)
    if (g) g.push(row)
    else groups.set(key, [row])
  }

  const unresolved: { id: string; description: string }[] = []
  for (const [key, members] of groups) {
    const text = [...new Set(members.map(m => m.catText ?? m.description))].join(' ')
    const hit = keywordCategory(text)
    for (const m of members) m.category = hit ?? 'Other'
    if (!hit) unresolved.push({ id: key, description: text.slice(0, 200) })
  }

  if (unresolved.length > 0) {
    const verdicts = await aiCategorize(unresolved)
    for (const { id } of unresolved) {
      const suggested = verdicts.get(id)
      if (!suggested || suggested === 'Other') continue
      for (const m of groups.get(id) ?? []) m.category = suggested
    }
  }

  return rows
}
