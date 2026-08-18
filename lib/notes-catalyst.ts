// The notes domain, ported to Catalyst Cloud Scale.
//
// Signatures are IDENTICAL to the five note functions in lib/db.ts, so routes do
// not change and the two backends are interchangeable. See lib/catalyst.ts for
// the constraints that dictate why writes and reads use different APIs.
import type { Note } from './types'
import {
  zcql, catalystApp, safeId, safeUserId, CATALYST_NOTES_TABLE as T,
} from './catalyst'

// Catalyst returns every column as a string and names the primary key ROWID.
// The rest of the app expects Note.id to be a number, as SQLite gave it.
function toNote(r: Record<string, unknown>): Note {
  return {
    id: Number(r.ROWID),
    user_id: String(r.user_id),
    title: String(r.title ?? 'Untitled'),
    content: String(r.content ?? ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

const COLS = 'ROWID, user_id, title, content, created_at, updated_at'

export async function getNotes(userId: string): Promise<Note[]> {
  const uid = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE user_id = '${uid}' ORDER BY updated_at DESC`,
  )
  return rows.map(toNote)
}

export async function getNote(userId: string, id: number): Promise<Note | null> {
  const uid = safeUserId(userId)
  const rid = safeId(id, 'note id')
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE ROWID = ${rid} AND user_id = '${uid}'`,
  )
  return rows.length ? toNote(rows[0]) : null
}

// Uses the object-based row API: content is user-authored HTML and must never be
// inlined into a ZCQL string.
export async function createNote(userId: string, title: string, content: string): Promise<Note> {
  const uid = safeUserId(userId)
  const now = new Date().toISOString()
  const table = catalystApp().datastore().table(T)
  const row = await table.insertRow({
    user_id: uid,
    title: title.slice(0, 255),      // varchar caps at 255
    content: content.slice(0, 10000), // text caps at 10000
    created_at: now,
    updated_at: now,
  })
  return toNote(row as unknown as Record<string, unknown>)
}

/**
 * Ownership is checked with a tenant-scoped ZCQL read BEFORE the row-API write,
 * because updateRow() addresses rows by ROWID alone and would otherwise let one
 * tenant overwrite another's note. Returns silently on a foreign/missing row so
 * the caller cannot distinguish "not yours" from "not found".
 */
export async function updateNote(
  userId: string, id: number, patch: { title?: string; content?: string },
): Promise<void> {
  const existing = await getNote(userId, id)
  if (!existing) return

  const row: Record<string, unknown> = { ROWID: safeId(id, 'note id'), updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = patch.title.slice(0, 255)
  if (patch.content !== undefined) row.content = patch.content.slice(0, 10000)

  await catalystApp().datastore().table(T).updateRow(row as never)
}

/**
 * Scoped ZCQL DELETE rather than deleteRow(): both inlined values are validated
 * (numeric id, restricted-charset uuid), so this is injection-safe AND enforces
 * tenancy in a single round trip. deleteRow() takes a bare ROWID and would not.
 */
export async function deleteNote(userId: string, id: number): Promise<void> {
  const uid = safeUserId(userId)
  const rid = safeId(id, 'note id')
  await zcql(`DELETE FROM ${T} WHERE ROWID = ${rid} AND user_id = '${uid}'`)
}
