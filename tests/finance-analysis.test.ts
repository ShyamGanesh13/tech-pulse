import { describe, test, expect } from 'bun:test'
import { analyse } from '../lib/finance-analysis'
import type { Transaction } from '../lib/types'

function txn(date: string, amount: number, type: Transaction['type'] = 'debit'): Transaction {
  return {
    user_id: 'u', id: `${date}-${amount}`, date, description: `${date} spend`,
    amount, type, category: 'Other', source: 'manual', reference: null, created_at: `${date}T00:00:00Z`,
  }
}

describe('analyse month anchoring', () => {
  // The bug: "this month" (top merchants, heatmap, anomalies) was anchored to the
  // calendar date, so in a fresh month with no data yet every card read blank.
  test('anchors on the latest month with data, not the calendar month', () => {
    const txns = [txn('2026-10-15', 500), txn('2026-10-20', 300), txn('2026-09-10', 999)]
    const out = analyse(txns, '2026-11-02') // "today" is an empty month

    expect(out.month).toBe('2026-10')
    expect(out.topMerchants.length).toBeGreaterThan(0)
    expect(Object.keys(out.dailyTotals).length).toBeGreaterThan(0)
  })

  test('falls back to the calendar month when there is no data', () => {
    expect(analyse([], '2026-11-02').month).toBe('2026-11')
  })
})
