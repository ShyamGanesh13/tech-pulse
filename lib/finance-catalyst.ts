// Finance, ported to Catalyst Cloud Scale.
//
// SAVED FOR LAST because it concentrates the migration's two worst failure modes,
// and both are silent:
//
// 1. Every date filter on Turso is `LIKE 'YYYY-MM%'`. On Catalyst `%` matches
//    NOTHING and reports success, so a naive port makes the whole finance module
//    read ₹0 rather than erroring. Prefix matches go through likePrefix(), which
//    emits Catalyst's `*`, and tests/catalyst-guard fails the build on a raw `%`
//    in this file.
//
// 2. Every total is a SUM. An unscoped or empty-filtered aggregate returns a
//    plausible number (0) instead of failing, so a scoping bug here looks like
//    "no spending this month" rather than a bug. Every aggregate below filters on
//    user_id, and the verify asserts on NON-ZERO expected totals so a silent
//    zero cannot pass.
//
// Column renames, mapped back so callers keep the app's shape:
//   date -> txn_date, description -> txn_description, type -> txn_type,
//   source -> import_source, reference -> txn_reference, month -> budget_month
//
// upsertBudget is the one genuinely awkward function in the migration: Turso uses
// ON CONFLICT ... RETURNING, and Catalyst has neither. It becomes an explicit
// scoped read-then-write keyed on the synthetic `uk` column, since composite
// uniqueness is not available.
import type { Transaction, Budget, MonthlyTotal } from './types'
import { randomUUID } from 'crypto'
import { zcql, catalystApp, safeUserId, likePrefix } from './catalyst'

const T_TXN = 'finance_transactions'
const T_BUD = 'finance_budgets'

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid id: ${u}`)
  return u
}

/** A YYYY-MM or YYYY-MM-DD fragment. Rejects anything else before inlining. */
function safeMonth(m: string): string {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(m)) throw new Error(`invalid month: ${m}`)
  return m
}

/** Free text used in a filter. Kept narrow because ZCQL cannot bind parameters. */
function safeText(v: string, what: string): string {
  if (v.includes("'") || v.length > 64) throw new Error(`unsafe ${what}: ${v}`)
  return v
}

function toTxn(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    date: String(r.txn_date),
    description: String(r.txn_description ?? ''),
    amount: Number(r.amount ?? 0),
    type: String(r.txn_type) as Transaction['type'],
    category: String(r.category ?? 'Other'),
    source: String(r.import_source ?? 'manual'),
    reference: r.txn_reference == null ? null : String(r.txn_reference),
    created_at: String(r.created_at),
  }
}

function toBudget(r: Record<string, unknown>): Budget {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    category: String(r.category),
    amount: Number(r.amount ?? 0),
    month: String(r.budget_month),
    created_at: String(r.created_at),
  }
}

const TXN_COLS = 'uid, user_id, txn_date, txn_description, amount, txn_type, category, import_source, txn_reference, created_at'
const BUD_COLS = 'uid, user_id, category, amount, budget_month, created_at'

// ── Transactions ────────────────────────────────────────────────────────────

export async function getTransactions(
  userId: string, filters: { month?: string; category?: string; type?: string; q?: string },
): Promise<Transaction[]> {
  const owner = safeUserId(userId)
  let sql = `SELECT ${TXN_COLS} FROM ${T_TXN} WHERE user_id = '${owner}'`
  if (filters.month)    sql += ` AND txn_date like ${likePrefix(safeMonth(filters.month))}`
  if (filters.category) sql += ` AND category = '${safeText(filters.category, 'category')}'`
  if (filters.type)     sql += ` AND txn_type = '${safeText(filters.type, 'type')}'`
  sql += ` ORDER BY txn_date DESC, created_at DESC`
  const rows = await zcql<Record<string, unknown>>(sql, T_TXN)
  let out = rows.map(toTxn)
  // Substring search is applied in JS: a LIKE '*q*' would need the query text
  // inlined, and description search is the one place a user's free text reaches
  // the predicate. Filtering here removes that surface entirely.
  if (filters.q) {
    const q = filters.q.toLowerCase()
    out = out.filter(t => t.description.toLowerCase().includes(q))
  }
  return out
}

/**
 * Monthly totals and a per-category breakdown. Both aggregates are tenant-scoped;
 * an unscoped SUM here would silently blend every tenant's spending into one
 * plausible-looking number.
 */
export async function getTransactionSummary(userId: string, month: string) {
  const owner = safeUserId(userId)
  const m = safeMonth(month)
  // Column aliases are ignored by ZCQL, so aggregate results come back keyed by
  // the expression text. Rather than depend on that, the rows are summed in JS
  // from a scoped projection — exact, and immune to the alias behaviour.
  const rows = await zcql<Record<string, unknown>>(
    `SELECT amount, txn_type, category FROM ${T_TXN}
     WHERE user_id = '${owner}' AND txn_date like ${likePrefix(m)}`, T_TXN,
  )
  let credit = 0, debit = 0
  const byCat = new Map<string, number>()
  for (const r of rows) {
    const amt = Number(r.amount ?? 0)
    if (String(r.txn_type) === 'credit') credit += amt
    else {
      debit += amt
      const c = String(r.category ?? 'Other')
      byCat.set(c, (byCat.get(c) ?? 0) + amt)
    }
  }
  const by_category = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  return { credit, debit, count: rows.length, by_category }
}

export async function createTransaction(
  userId: string,
  data: { date: string; description: string; amount: number; type: string; category: string; source: string; reference?: string | null },
): Promise<Transaction> {
  const owner = safeUserId(userId)
  const id = randomUUID()
  const now = new Date().toISOString()
  await (await catalystApp()).datastore().table(T_TXN).insertRow({
    uid: id, user_id: owner, txn_date: data.date,
    txn_description: data.description.slice(0, 255), amount: data.amount,
    txn_type: data.type, category: data.category, import_source: data.source,
    txn_reference: data.reference ?? null, created_at: now,
  })
  return {
    id, user_id: owner, date: data.date, description: data.description,
    amount: data.amount, type: data.type as Transaction['type'], category: data.category,
    source: data.source, reference: data.reference ?? null, created_at: now,
  }
}

export async function importTransactions(
  userId: string,
  rows: { date: string; description: string; amount: number; type: string; category: string; source: string }[],
): Promise<number> {
  const owner = safeUserId(userId)
  if (rows.length === 0) return 0
  const now = new Date().toISOString()
  await (await catalystApp()).datastore().table(T_TXN).insertRows(
    rows.map(r => ({
      uid: randomUUID(), user_id: owner, txn_date: r.date,
      txn_description: r.description.slice(0, 255), amount: r.amount,
      txn_type: r.type, category: r.category, import_source: r.source, created_at: now,
    })),
  )
  return rows.length
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  await zcql(`DELETE FROM ${T_TXN} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_TXN)
}

export async function getImportSources(
  userId: string,
): Promise<{ source: string; count: number; min_date: string; max_date: string }[]> {
  const owner = safeUserId(userId)
  // GROUP BY works, but with aliases ignored the result keys are awkward, and the
  // MIN/MAX/COUNT trio is trivial to fold in JS from a scoped projection.
  const rows = await zcql<Record<string, unknown>>(
    `SELECT import_source, txn_date FROM ${T_TXN} WHERE user_id = '${owner}'`, T_TXN,
  )
  const acc = new Map<string, { count: number; min: string; max: string }>()
  for (const r of rows) {
    const s = String(r.import_source)
    const d = String(r.txn_date)
    const cur = acc.get(s)
    if (!cur) acc.set(s, { count: 1, min: d, max: d })
    else {
      cur.count++
      if (d < cur.min) cur.min = d
      if (d > cur.max) cur.max = d
    }
  }
  return [...acc.entries()].map(([source, v]) => ({
    source, count: v.count, min_date: v.min, max_date: v.max,
  }))
}

export async function deleteTransactionsBySource(userId: string, source: string): Promise<number> {
  const owner = safeUserId(userId)
  const src = safeText(source, 'source')
  const doomed = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_TXN} WHERE user_id = '${owner}' AND import_source = '${src}'`, T_TXN,
  )
  if (doomed.length === 0) return 0
  await (await catalystApp()).datastore().table(T_TXN)
    .deleteRows(doomed.map(r => String(r.ROWID)))
  return doomed.length
}

export async function getMonthlyTotals(userId: string, numMonths: number): Promise<MonthlyTotal[]> {
  const owner = safeUserId(userId)
  // Turso groups on substr(date,1,7). ZCQL has no string functions, so the month
  // is derived in JS from the scoped rows.
  const rows = await zcql<Record<string, unknown>>(
    `SELECT txn_date, amount, txn_type FROM ${T_TXN} WHERE user_id = '${owner}'`, T_TXN,
  )
  const acc = new Map<string, { credit: number; debit: number }>()
  for (const r of rows) {
    const month = String(r.txn_date).slice(0, 7)
    const cur = acc.get(month) ?? { credit: 0, debit: 0 }
    const amt = Number(r.amount ?? 0)
    if (String(r.txn_type) === 'credit') cur.credit += amt
    else cur.debit += amt
    acc.set(month, cur)
  }
  return [...acc.entries()]
    .map(([month, v]) => ({ month, credit: v.credit, debit: v.debit }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, numMonths)
    .reverse()
}

// ── Budgets ─────────────────────────────────────────────────────────────────

export async function getBudgets(userId: string, month: string): Promise<Budget[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${BUD_COLS} FROM ${T_BUD}
     WHERE user_id = '${owner}' AND budget_month = '${safeMonth(month)}'
     ORDER BY category ASC`, T_BUD,
  )
  return rows.map(toBudget)
}

/**
 * Turso does INSERT ... ON CONFLICT(user_id, category, month) DO UPDATE RETURNING.
 * Catalyst has none of those three, so this is a scoped read on the synthetic `uk`
 * column then an insert or update. The uk embeds user_id, so the read can only
 * ever find this tenant's budget — the update path cannot be steered onto
 * another tenant's row.
 */
export async function upsertBudget(
  userId: string, category: string, amount: number, month: string,
): Promise<Budget> {
  const owner = safeUserId(userId)
  const cat = safeText(category, 'category')
  const m = safeMonth(month)
  const uk = `${owner}|${cat}|${m}`

  const existing = await zcql<Record<string, unknown>>(
    `SELECT ROWID, uid, created_at FROM ${T_BUD} WHERE uk = '${uk}'`, T_BUD,
  )
  const table = (await catalystApp()).datastore().table(T_BUD)

  if (existing.length > 0) {
    await table.updateRow({ ROWID: String(existing[0].ROWID), amount } as never)
    // The EXISTING id is returned, not a new one — the behaviour RETURNING gave.
    return {
      id: String(existing[0].uid), user_id: owner, category: cat, amount, month: m,
      created_at: String(existing[0].created_at),
    }
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  await table.insertRow({
    uid: id, uk, user_id: owner, category: cat, amount, budget_month: m, created_at: now,
  })
  return { id, user_id: owner, category: cat, amount, month: m, created_at: now }
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  await zcql(`DELETE FROM ${T_BUD} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_BUD)
}
