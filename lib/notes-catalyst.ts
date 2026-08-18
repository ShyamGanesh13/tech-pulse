// The notes domain, ported to Catalyst Cloud Scale.
//
// ── THE ID PROBLEM, and why this file does not reuse the app's Note type ──────
//
// Catalyst ROWIDs are 17 digits, which exceeds Number.MAX_SAFE_INTEGER (16).
// The Datastore row API returns ROWID as a RAW JSON NUMBER, so JSON.parse
// silently rounds it. Measured against the live datastore:
//
//   actual ROWID                  51859000000046006
//   JSON.parse of the row API     51859000000046010     <- wrong by 4
//
// ZCQL, by contrast, returns ROWID as a STRING and is exact. So:
//
//   * ROWID must NEVER pass through Number(). Ids are strings here.
//   * A freshly inserted row's id is NOT read from the insert response. We
//     insert our own note_uid uuid and then look the row up by it via ZCQL,
//     which yields the authoritative string ROWID.
//
// The app's shared `Note` type declares `id: number`, which is unsafe against
// Catalyst. Rather than silently corrupt ids, this module exports its own
// CatalystNote with `id: string`. Migrating the rest of the app means changing
// id to string on Todo, Nyabagam, Note, Transaction, Budget, UraiConversation
// and UraiMessage too — that divergence is deliberate and visible here.
//
// See lib/catalyst.ts for the injection and tenancy constraints that dictate
// why writes use the row API and reads use ZCQL.
import type { Note } from './types'
import { randomUUID } from 'crypto'
import {
  zcql, catalystApp, safeUserId, CATALYST_NOTES_TABLE as T,
} from './catalyst'

/** Same shape as the app's Note, but with a Catalyst-safe string id. */
export type CatalystNote = Omit<Note, 'id'> & { id: string }

function toNote(r: Record<string, unknown>): CatalystNote {
  return {
    id: String(r.ROWID), // never Number() — see the header note
    user_id: String(r.user_id),
    title: String(r.title ?? 'Untitled'),
    content: String(r.content ?? ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

/** A ROWID as a string. Rejects anything non-numeric so it is safe to inline. */
function safeRowId(id: string, what = 'note id'): string {
  const s = String(id)
  if (!/^\d{1,20}$/.test(s)) throw new Error(`${what} is not a valid row id: ${s}`)
  return s
}

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid note_uid: ${u}`)
  return u
}

const COLS = 'ROWID, user_id, title, content, created_at, updated_at'

export async function getNotes(userId: string): Promise<CatalystNote[]> {
  const uid = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE user_id = '${uid}' ORDER BY updated_at DESC`,
  )
  return rows.map(toNote)
}

export async function getNote(userId: string, id: string): Promise<CatalystNote | null> {
  const uid = safeUserId(userId)
  const rid = safeRowId(id)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE ROWID = ${rid} AND user_id = '${uid}'`,
  )
  return rows.length ? toNote(rows[0]) : null
}

/**
 * Inserts via the object-based row API (content is user-authored HTML and must
 * never be inlined into ZCQL), then re-reads through ZCQL by our own note_uid to
 * obtain the exact string ROWID. The insert response's ROWID is deliberately
 * discarded — it arrives as a rounded JSON number.
 */
export async function createNote(userId: string, title: string, content: string): Promise<CatalystNote> {
  const uid = safeUserId(userId)
  const now = new Date().toISOString()
  const noteUid = randomUUID()

  const table = (await catalystApp()).datastore().table(T)
  await table.insertRow({
    user_id: uid,
    note_uid: noteUid,
    title: title.slice(0, 255),        // varchar caps at 255
    content: content.slice(0, 10000),  // text caps at 10000
    created_at: now,
    updated_at: now,
  })

  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE note_uid = '${safeUuid(noteUid)}' AND user_id = '${uid}'`,
  )
  if (rows.length === 0) throw new Error('createNote: row not found after insert')
  return toNote(rows[0])
}

/**
 * Ownership is verified with a tenant-scoped ZCQL read BEFORE the row-API write,
 * because updateRow() addresses rows by ROWID alone and would otherwise let one
 * tenant overwrite another's note. Returns silently on a foreign or missing row,
 * so a caller cannot distinguish "not yours" from "not found".
 */
export async function updateNote(
  userId: string, id: string, patch: { title?: string; content?: string },
): Promise<void> {
  const existing = await getNote(userId, id)
  if (!existing) return

  const row: Record<string, unknown> = {
    ROWID: safeRowId(id),
    updated_at: new Date().toISOString(),
  }
  if (patch.title !== undefined) row.title = patch.title.slice(0, 255)
  if (patch.content !== undefined) row.content = patch.content.slice(0, 10000)

  await (await catalystApp()).datastore().table(T).updateRow(row as never)
}

/**
 * Scoped ZCQL DELETE rather than deleteRow(): both inlined values are validated
 * (numeric ROWID, restricted-charset tenant id), so this is injection-safe AND
 * enforces tenancy in one round trip. deleteRow() takes a bare ROWID and would
 * enforce nothing.
 */
export async function deleteNote(userId: string, id: string): Promise<void> {
  const uid = safeUserId(userId)
  const rid = safeRowId(id)
  await zcql(`DELETE FROM ${T} WHERE ROWID = ${rid} AND user_id = '${uid}'`)
}
