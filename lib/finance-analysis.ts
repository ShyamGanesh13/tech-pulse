// Derived views over a tenant's transaction history: recurring charges, top
// merchants, weekday and daily shape, outliers, and a forecast for next month.
//
// Everything here is a pure function of the rows it is handed — no I/O, no
// state, no AI. The numbers are arithmetic the user could redo by hand, which
// matters for a screen that tells someone what they can spend.
import type { Transaction } from './types'

// ── payee identity ──────────────────────────────────────────────────────────

/**
 * A stable key for "the same payee". The import leaves descriptions carrying
 * per-transaction noise — reference numbers, statement dates, a narration
 * prefix — so grouping on the raw string finds nothing recurring:
 *
 *   "HDFCMF 05102026 CAMS"                      -> "hdfcmf cams"
 *   "NEFT-SCBLH27800666572-ZOHO CORPORATION"    -> "neft zoho corporation"
 *   "Pay For In — Swiggy Ltd"                   -> "swiggy ltd"
 */
export function payeeKey(description: string): string {
  const afterDash = description.includes('—')
    ? description.slice(description.lastIndexOf('—') + 1)
    : description
  return afterDash
    .toLowerCase()
    .split(/[\s\-/_]+/)
    // Drop reference-ish tokens: anything with a digit in it, which covers
    // statement dates, UTR/UPI refs and card fragments alike.
    .filter(t => t.length > 1 && !/\d/.test(t))
    .join(' ')
    .trim()
}

const monthOf = (date: string) => date.slice(0, 7)

function median(ns: number[]): number {
  if (ns.length === 0) return 0
  const s = [...ns].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Median absolute deviation — the spread measure a single huge transfer can't move. */
function mad(ns: number[]): number {
  if (ns.length === 0) return 0
  const m = median(ns)
  return median(ns.map(n => Math.abs(n - m)))
}

const debits = (txns: Transaction[]) => txns.filter(t => t.type === 'debit')

/** Month string arithmetic: nextMonth('2026-12') === '2027-01'. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const zero = y * 12 + (m - 1) + delta
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, '0')}`
}

// ── recurring charges ───────────────────────────────────────────────────────

export interface Recurring {
  label: string
  key: string
  category: string
  amount: number        // representative (median) charge
  monthsSeen: number
  lastDate: string
  everyMonth: boolean   // seen in consecutive months, not just repeatedly
}

/**
 * Charges that look committed rather than discretionary: the same payee, at a
 * steady amount, in at least three distinct months.
 *
 * Three months and a ±20% band are the whole heuristic. Two hits is a
 * coincidence (two Swiggy orders are not a subscription), and an exact-amount
 * match would miss the real ones — utility bills and EMIs with interest drift
 * a little every month.
 */
export function recurring(txns: Transaction[], minMonths = 3): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of debits(txns)) {
    const key = payeeKey(t.description)
    if (!key) continue
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }

  const out: Recurring[] = []
  for (const [key, rows] of groups) {
    const months = [...new Set(rows.map(r => monthOf(r.date)))].sort()
    if (months.length < minMonths) continue

    const mid = median(rows.map(r => r.amount))
    if (mid <= 0) continue
    const steady = rows.filter(r => Math.abs(r.amount - mid) <= mid * 0.2)
    // Count steady months, not steady rows: three charges inside one month is
    // a shopping habit, not a subscription.
    const steadyMonths = [...new Set(steady.map(r => monthOf(r.date)))]
    if (steadyMonths.length < minMonths) continue

    const consecutive = months.every(
      (m, i) => i === 0 || m === addMonths(months[i - 1], 1),
    )
    out.push({
      label: rows[rows.length - 1].description,
      key,
      category: rows[rows.length - 1].category,
      amount: mid,
      monthsSeen: steadyMonths.length,
      lastDate: rows.map(r => r.date).sort().at(-1)!,
      everyMonth: consecutive,
    })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

// ── merchants ───────────────────────────────────────────────────────────────

export interface Merchant { label: string; total: number; count: number }

export function topMerchants(txns: Transaction[], limit = 8): Merchant[] {
  const acc = new Map<string, Merchant>()
  for (const t of debits(txns)) {
    const key = payeeKey(t.description) || t.description.toLowerCase()
    const cur = acc.get(key)
    if (cur) { cur.total += t.amount; cur.count++ }
    else acc.set(key, { label: t.description, total: t.amount, count: 1 })
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

// ── time shape ──────────────────────────────────────────────────────────────

export interface WeekdaySpend { weekday: number; label: string; total: number; average: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Spend by day of week. The average divides by how many of that weekday the
 * data actually spans, not by how many had a transaction — otherwise a weekday
 * you rarely spend on looks as expensive as one you always do.
 */
export function byDayOfWeek(txns: Transaction[]): WeekdaySpend[] {
  const rows = debits(txns)
  const totals = new Array(7).fill(0)
  for (const t of rows) totals[new Date(`${t.date}T00:00:00Z`).getUTCDay()] += t.amount

  const dates = rows.map(t => t.date).sort()
  const occurrences = new Array(7).fill(0)
  if (dates.length > 0) {
    for (let d = new Date(`${dates[0]}T00:00:00Z`); d <= new Date(`${dates.at(-1)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      occurrences[d.getUTCDay()]++
    }
  }

  return totals.map((total, weekday) => ({
    weekday,
    label: WEEKDAYS[weekday],
    total,
    average: occurrences[weekday] > 0 ? total / occurrences[weekday] : 0,
  }))
}

/** Debit total per calendar day, for a month's heatmap. Days with no spend are absent. */
export function dailyTotals(txns: Transaction[], month: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of debits(txns)) {
    if (monthOf(t.date) !== month) continue
    out[t.date] = (out[t.date] ?? 0) + t.amount
  }
  return out
}

// ── outliers ────────────────────────────────────────────────────────────────

export interface Anomaly {
  id: string
  date: string
  description: string
  amount: number
  category: string
  reason: string
}

/**
 * Transactions worth a second look, measured against the user's own habits
 * rather than any absolute rupee threshold.
 *
 * Deviation is scored on median + MAD, not mean + standard deviation: one
 * ₹50,000 transfer drags a mean up far enough to hide everything else, and
 * this data has exactly that shape.
 */
export function anomalies(txns: Transaction[], month: string, limit = 6): Anomaly[] {
  const all = debits(txns)
  const byCat = new Map<string, number[]>()
  for (const t of all) {
    const arr = byCat.get(t.category)
    if (arr) arr.push(t.amount)
    else byCat.set(t.category, [t.amount])
  }

  // First sighting of each payee across the whole history, so "first time" is
  // a fact about the history and not about the month being viewed.
  const firstSeen = new Map<string, string>()
  for (const t of [...all].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = payeeKey(t.description)
    if (k && !firstSeen.has(k)) firstSeen.set(k, t.date)
  }

  const out: Anomaly[] = []
  for (const t of all) {
    if (monthOf(t.date) !== month) continue
    const peers = byCat.get(t.category) ?? []
    const m = median(peers)
    const spread = mad(peers)
    const key = payeeKey(t.description)

    // A floor on the comparison: with a tight cluster of small charges MAD
    // approaches zero and every rupee above the median looks like an outlier.
    const threshold = m + Math.max(spread * 3, m * 0.5)

    if (peers.length >= 5 && t.amount > threshold && m > 0) {
      out.push({
        id: t.id, date: t.date, description: t.description, amount: t.amount,
        category: t.category,
        reason: `${(t.amount / m).toFixed(1)}× your typical ${t.category} spend`,
      })
    } else if (key && firstSeen.get(key) === t.date && t.amount > median(all.map(a => a.amount)) * 2) {
      out.push({
        id: t.id, date: t.date, description: t.description, amount: t.amount,
        category: t.category,
        reason: 'first time at this payee, and well above your usual amount',
      })
    }
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, limit)
}

// ── forecast ────────────────────────────────────────────────────────────────

export interface ForecastLine {
  category: string
  amount: number
  monthsUsed: number
  confidence: 'good' | 'fair' | 'low'
}

export interface Forecast {
  month: string
  lines: ForecastLine[]
  excluded: ForecastLine[]  // money movement, shown but not budgeted
  total: number
  committed: number         // the part already explained by recurring charges
  expectedIncome: number
  completeMonths: string[]
}

/**
 * Categories kept out of the spending plan.
 *
 * Transfers is not discretionary spending in this data — it is the salary
 * landing and being moved to another account. The real statement carries a
 * ~₹77,540 credit from the employer followed by a debit of the same amount to
 * "MMT", every month. A median does not filter that out, precisely because it
 * is regular, so an unfiltered plan's largest line was ₹77,580 of "Transfers"
 * — advice to budget for money you are only relocating. It stays visible, but
 * out of the total.
 */
const NOT_SPENDING = ['Transfers']

/**
 * A spending plan for next month, per category.
 *
 * Only *complete* months feed it. The current month is partial by definition,
 * and the earliest month in an imported statement is partial too (a statement
 * starts mid-month), so including either pulls every number down. Each
 * category takes the median of its last three complete months: one holiday or
 * one insurance premium should not become a standing budget, which is exactly
 * what a mean would do.
 */
export function forecast(txns: Transaction[], today: string): Forecast {
  const months = [...new Set(txns.map(t => monthOf(t.date)))].sort()
  const currentMonth = monthOf(today)
  // Drop the first month (statement starts mid-month) and the current one.
  const completeMonths = months.filter((m, i) => i > 0 && m < currentMonth)
  const target = addMonths(currentMonth, 1)

  if (completeMonths.length === 0) {
    return { month: target, lines: [], excluded: [], total: 0, committed: 0, expectedIncome: 0, completeMonths }
  }

  const window = completeMonths.slice(-3)
  const inWindow = txns.filter(t => window.includes(monthOf(t.date)))

  // Per category, one total per month in the window — a category absent from a
  // month counts as 0 for that month, or anything intermittent reads as if it
  // happens every month.
  const perCat = new Map<string, Map<string, number>>()
  for (const t of debits(inWindow)) {
    const m = perCat.get(t.category) ?? new Map<string, number>()
    m.set(monthOf(t.date), (m.get(monthOf(t.date)) ?? 0) + t.amount)
    perCat.set(t.category, m)
  }

  const all: ForecastLine[] = []
  for (const [category, monthly] of perCat) {
    const series = window.map(m => monthly.get(m) ?? 0)
    const amount = median(series)
    if (amount <= 0) continue
    const monthsUsed = series.filter(v => v > 0).length
    all.push({
      category,
      amount: Math.round(amount),
      monthsUsed,
      confidence: monthsUsed >= 3 ? 'good' : monthsUsed === 2 ? 'fair' : 'low',
    })
  }
  all.sort((a, b) => b.amount - a.amount)
  const lines    = all.filter(l => !NOT_SPENDING.includes(l.category))
  const excluded = all.filter(l =>  NOT_SPENDING.includes(l.category))

  const incomeByMonth = window.map(m =>
    inWindow.filter(t => t.type === 'credit' && monthOf(t.date) === m)
      .reduce((s, t) => s + t.amount, 0))

  // Committed = the regular charges inside the plan. Transfers are excluded
  // here for the same reason they are excluded from the total.
  const plannedCategories = new Set(lines.map(l => l.category))
  const committed = recurring(txns)
    .filter(r => r.everyMonth && plannedCategories.has(r.category))
    .reduce((s, r) => s + r.amount, 0)

  return {
    month: target,
    lines,
    excluded,
    total: lines.reduce((s, l) => s + l.amount, 0),
    committed: Math.round(committed),
    expectedIncome: Math.round(median(incomeByMonth)),
    completeMonths,
  }
}

// ── one call for the whole Analytics screen ─────────────────────────────────

export function analyse(txns: Transaction[], today: string) {
  const month = today.slice(0, 7)
  const thisMonth = txns.filter(t => monthOf(t.date) === month)
  return {
    month,
    recurring: recurring(txns).slice(0, 10),
    topMerchants: topMerchants(thisMonth),
    byDayOfWeek: byDayOfWeek(txns),
    dailyTotals: dailyTotals(txns, month),
    anomalies: anomalies(txns, month),
    forecast: forecast(txns, today),
  }
}
