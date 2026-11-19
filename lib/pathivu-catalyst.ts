// The Pathivu (work journal) domain on Catalyst Cloud Scale.
//
// Same shape as notes-catalyst.ts: a uuid we own is the logical id (ROWID is
// 17 digits and rounds through JSON.parse), reads go through ZCQL, and writes go
// through the Datastore row API because the entry text is dictated free text and
// ZCQL cannot bind parameters.
//
// Cloud Scale has no composite unique, so one-entry-per-day is enforced by a
// synthetic `uk` column holding `user_id|entry_date`, the same trick articles
// uses for user_id|article_id.
import type { Pathivu } from './types'
import { randomUUID } from 'crypto'
import { appendTranscript } from './pathivu'
import {
  zcql, pagedZcql, catalystApp, safeUserId, likePrefix,
} from './catalyst'

const T = 'pathivu'
const COLS = 'uid, user_id, entry_date, raw_transcript, content, created_at, updated_at'

/**
 * Catalyst text columns cap at 10000 chars and truncate SILENTLY. A cut journal
 * entry is a lost day with no error to notice, so an over-long save is refused
 * outright — the same call Kuripu made for pasted note content.
 */
const TEXT_MAX = 10000

function checkedText(v: string, what: string): string {
  if (v.length > TEXT_MAX) {
    throw new Error(`pathivu ${what} is ${v.length} chars; the column caps at ${TEXT_MAX} and would truncate silently`)
  }
  return v
}

/** A YYYY-MM-DD day. Inlined into ZCQL, so it is proven rather than escaped. */
function safeDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`invalid pathivu entry_date: ${d}`)
  return d
}

/** Validates a ROWID read back from the datastore before it is inlined. */
function safeRowId(v: unknown): string {
  const s = String(v)
  if (!/^\d{1,20}$/.test(s)) throw new Error(`unexpected ROWID from datastore: ${s}`)
  return s
}

function dayUk(userId: string, entryDate: string): string {
  return `${userId}|${entryDate}`
}

function toPathivu(r: Record<string, unknown>): Pathivu {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    entry_date: String(r.entry_date),
    raw_transcript: String(r.raw_transcript ?? ''),
    content: String(r.content ?? ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

export async function getPathivu(userId: string, entryDate: string): Promise<Pathivu | null> {
  const owner = safeUserId(userId)
  const day = safeDate(entryDate)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE user_id = '${owner}' AND entry_date = '${day}'`, T,
  )
  return rows.length ? toPathivu(rows[0]) : null
}

/**
 * Every entry in the range, both ends inclusive.
 *
 * Paged: a month is ~30 rows today, but a year-to-date or all-time report would
 * cross the 300-row ZCQL ceiling, which truncates without saying so. entry_date
 * is unique per user, so it is a total order and pages cannot repeat or skip.
 */
export async function getPathivuRange(userId: string, from: string, to: string): Promise<Pathivu[]> {
  const owner = safeUserId(userId)
  const lo = safeDate(from)
  const hi = safeDate(to)
  const rows = await pagedZcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T}
     WHERE user_id = '${owner}' AND entry_date >= '${lo}' AND entry_date <= '${hi}'
     ORDER BY entry_date ASC`, T,
  )
  return rows.map(toPathivu)
}

export async function getPathivuDates(userId: string, year: number, month: number): Promise<number[]> {
  const owner = safeUserId(userId)
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT entry_date FROM ${T}
     WHERE user_id = '${owner}' AND entry_date like ${likePrefix(prefix)}`, T,
  )
  const days = new Set<number>()
  for (const r of rows) {
    const d = parseInt(String(r.entry_date ?? '').slice(8, 10), 10)
    if (!isNaN(d)) days.add(d)
  }
  return [...days]
}

/**
 * Creates the day's entry or edits it in place.
 *
 * The ownership check and the ROWID lookup are the same tenant-scoped query:
 * updateRow() addresses rows by ROWID alone and has no tenant filter, so the
 * query is what proves this day belongs to this user.
 *
 * `rawTranscript` appends rather than replaces — a second dictation into the
 * same day must not erase the words the first one heard.
 */
export async function savePathivu(userId: string, entryDate: string, content: string, rawTranscript: string | null): Promise<Pathivu> {
  const owner = safeUserId(userId)
  const day = safeDate(entryDate)
  const now = new Date().toISOString()
  const body = checkedText(content, 'content')

  const existing = await zcql<Record<string, unknown>>(
    `SELECT ROWID, ${COLS} FROM ${T} WHERE user_id = '${owner}' AND entry_date = '${day}'`, T,
  )
  const table = (await catalystApp()).datastore().table(T)

  if (existing.length) {
    const row = existing[0]
    const prior = toPathivu(row)
    const raw = appendTranscript(prior.raw_transcript, rawTranscript)
    await table.updateRow({
      ROWID: safeRowId(row.ROWID),
      content: body,
      raw_transcript: raw,
      updated_at: now,
    })
    return { ...prior, content: body, raw_transcript: raw, updated_at: now }
  }

  const id = randomUUID()
  const raw = appendTranscript('', rawTranscript)
  await table.insertRow({
    uid: id,
    uk: dayUk(owner, day),
    user_id: owner,
    entry_date: day,
    raw_transcript: raw,
    content: body,
    created_at: now,
    updated_at: now,
  })
  return { id, user_id: owner, entry_date: day, raw_transcript: raw, content: body, created_at: now, updated_at: now }
}
