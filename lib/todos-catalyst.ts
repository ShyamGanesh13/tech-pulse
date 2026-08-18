// Todos and reminders (nyabagam), ported to Catalyst Cloud Scale.
//
// Three Catalyst constraints shape this file, all measured against the live
// datastore rather than taken from documentation:
//
// 1. NO STRING FUNCTIONS. `substr(col, 1, 10)` is rejected — ZCQL parses it as an
//    aggregate ("Aggregate function cannot have more than one column"), and
//    `SUBSTRING(x FROM a FOR b)` is a syntax error. The Turso implementation uses
//    substr() in three places. Two workarounds are used here:
//      - Date RANGES: ISO 8601 strings sort lexicographically, so plain >= / <=
//        on the full timestamp is exact and needs no substr. Verified live.
//      - Day EXTRACTION (calendar dots): done in JS after fetching the month's
//        rows. The volume is one month of one user's items.
//
// 2. `%` IS NOT THE WILDCARD — `*` is, and `%` matches nothing while reporting
//    success. Every prefix match goes through likePrefix(). tests/catalyst-guard
//    fails the build if a raw % appears in this file.
//
// 3. `priority` IS A RESERVED COLUMN NAME. The column is task_priority and is
//    mapped back to `priority` here, so callers see the app's shape.
import type { Todo, Nyabagam } from './types'
import { randomUUID } from 'crypto'
import { zcql, catalystApp, safeUserId, likePrefix } from './catalyst'

const T_TODO = 'todos'
const T_REMIND = 'nyabagam'

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid id: ${u}`)
  return u
}

/** An ISO date or date-prefix. Rejects anything that is not date-shaped. */
function safeDate(d: string): string {
  if (!/^[0-9T:.\-Z]{4,32}$/.test(d)) throw new Error(`invalid date: ${d}`)
  return d
}

function toTodo(r: Record<string, unknown>): Todo {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    title: String(r.title ?? ''),
    description: r.description == null ? null : String(r.description),
    priority: String(r.task_priority ?? 'medium') as Todo['priority'],
    done: Number(r.done ?? 0),
    due_date: r.due_date == null ? null : String(r.due_date),
    completed_at: r.completed_at == null ? null : String(r.completed_at),
    created_at: String(r.created_at),
  }
}

function toRemind(r: Record<string, unknown>): Nyabagam {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    title: String(r.title ?? ''),
    description: r.description == null ? null : String(r.description),
    remind_at: String(r.remind_at),
    created_at: String(r.created_at),
  }
}

const TODO_COLS = 'uid, user_id, title, description, task_priority, done, due_date, completed_at, created_at'
const REMIND_COLS = 'uid, user_id, title, description, remind_at, created_at'

// ── Todos ───────────────────────────────────────────────────────────────────

export async function getTodos(userId: string): Promise<Todo[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${TODO_COLS} FROM ${T_TODO} WHERE user_id = '${owner}' ORDER BY created_at DESC`, T_TODO,
  )
  return rows.map(toTodo)
}

export async function getTodosByDate(userId: string, dateStr: string): Promise<Todo[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${TODO_COLS} FROM ${T_TODO}
     WHERE user_id = '${owner}' AND due_date like ${likePrefix(safeDate(dateStr))}
     ORDER BY done ASC, created_at DESC`, T_TODO,
  )
  return rows.map(toTodo)
}

/**
 * Open tasks plus those completed on `dateStr`, so ticking something off does not
 * make it vanish mid-session. The multi-key ORDER BY with a CASE expression that
 * Turso uses is not portable, so ordering is done in JS.
 */
export async function getAgendaTodos(userId: string, dateStr: string): Promise<Todo[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${TODO_COLS} FROM ${T_TODO} WHERE user_id = '${owner}'`, T_TODO,
  )
  const day = safeDate(dateStr)
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>
  return rows.map(toTodo)
    .filter(t => t.done === 0 || (t.completed_at ?? '').startsWith(day))
    .sort((a, b) =>
      a.done - b.done ||
      Number(a.due_date == null) - Number(b.due_date == null) ||
      (a.due_date ?? '').localeCompare(b.due_date ?? '') ||
      (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) ||
      b.created_at.localeCompare(a.created_at))
}

/**
 * Days of the month that have a due task — the calendar dots.
 * Turso does `SELECT DISTINCT substr(due_date, 9, 2)`. With no substr in ZCQL the
 * month is fetched by prefix and the day extracted in JS.
 */
export async function getDatesWithTodos(userId: string, year: number, month: number): Promise<number[]> {
  const owner = safeUserId(userId)
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT due_date FROM ${T_TODO}
     WHERE user_id = '${owner}' AND due_date like ${likePrefix(prefix)}`, T_TODO,
  )
  const days = new Set<number>()
  for (const r of rows) {
    const d = parseInt(String(r.due_date ?? '').slice(8, 10), 10)
    if (!isNaN(d)) days.add(d)
  }
  return [...days]
}

export async function createTodo(
  userId: string, title: string, description: string | null, priority: string, due_date?: string | null,
): Promise<Todo> {
  const owner = safeUserId(userId)
  const now = new Date().toISOString()
  const id = randomUUID()
  await (await catalystApp()).datastore().table(T_TODO).insertRow({
    uid: id,
    user_id: owner,
    title: title.slice(0, 255),
    description,
    task_priority: priority,
    done: 0,
    due_date: due_date ?? null,
    created_at: now,
  })
  return {
    id, user_id: owner, title, description, priority: priority as Todo['priority'],
    done: 0, due_date: due_date ?? null, completed_at: null, created_at: now,
  }
}

/**
 * The ownership check and the ROWID lookup are the same tenant-scoped query, so
 * one query both authorises the write and supplies its target. updateRow()
 * addresses rows by ROWID alone and would otherwise enforce nothing.
 */
export async function updateTodo(
  userId: string, id: string,
  patch: { done?: number; title?: string; priority?: string; due_date?: string | null; completed_at?: string | null },
): Promise<void> {
  const owner = safeUserId(userId)
  const owned = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_TODO} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_TODO,
  )
  if (owned.length === 0) return

  const row: Record<string, unknown> = { ROWID: String(owned[0].ROWID) }
  if (patch.done !== undefined) {
    row.done = patch.done
    // Stamp completion so the agenda can keep showing today's ticks.
    row.completed_at = patch.done ? (patch.completed_at ?? new Date().toISOString()) : null
  }
  if (patch.title !== undefined) row.title = patch.title.slice(0, 255)
  if (patch.priority !== undefined) row.task_priority = patch.priority
  if (patch.due_date !== undefined) row.due_date = patch.due_date

  await (await catalystApp()).datastore().table(T_TODO).updateRow(row as never)
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  await zcql(`DELETE FROM ${T_TODO} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_TODO)
}

// ── Reminders (nyabagam) ────────────────────────────────────────────────────

export async function getNyabagamByDate(userId: string, dateStr: string): Promise<Nyabagam[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${REMIND_COLS} FROM ${T_REMIND}
     WHERE user_id = '${owner}' AND remind_at like ${likePrefix(safeDate(dateStr))}
     ORDER BY remind_at ASC`, T_REMIND,
  )
  return rows.map(toRemind)
}

/**
 * Turso compares `substr(remind_at, 1, 10)` against a date range. ISO 8601 sorts
 * lexicographically, so comparing the full timestamp against `date` and
 * `date + 'T99'` is exact and needs no substr. Verified against the live
 * datastore.
 */
export async function getUpcomingNyabagam(userId: string, dateStr: string, days = 14): Promise<Nyabagam[]> {
  const owner = safeUserId(userId)
  const from = safeDate(dateStr)
  const end = new Date(`${from}T00:00:00`)
  end.setDate(end.getDate() + days)
  const to = end.toISOString().slice(0, 10)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${REMIND_COLS} FROM ${T_REMIND}
     WHERE user_id = '${owner}' AND remind_at > '${from}T99' AND remind_at <= '${to}T99'
     ORDER BY remind_at ASC`, T_REMIND,
  )
  return rows.map(toRemind)
}

export async function getDatesWithNyabagam(userId: string, year: number, month: number): Promise<number[]> {
  const owner = safeUserId(userId)
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT remind_at FROM ${T_REMIND}
     WHERE user_id = '${owner}' AND remind_at like ${likePrefix(prefix)}`, T_REMIND,
  )
  const out = new Set<number>()
  for (const r of rows) {
    const d = parseInt(String(r.remind_at ?? '').slice(8, 10), 10)
    if (!isNaN(d)) out.add(d)
  }
  return [...out]
}

export async function createNyabagam(
  userId: string, title: string, description: string | null, remind_at: string,
): Promise<Nyabagam> {
  const owner = safeUserId(userId)
  const now = new Date().toISOString()
  const id = randomUUID()
  await (await catalystApp()).datastore().table(T_REMIND).insertRow({
    uid: id, user_id: owner, title: title.slice(0, 255), description,
    remind_at, created_at: now,
  })
  return { id, user_id: owner, title, description, remind_at, created_at: now }
}

export async function deleteNyabagam(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  await zcql(`DELETE FROM ${T_REMIND} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_REMIND)
}
