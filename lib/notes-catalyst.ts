// The notes domain, ported to Catalyst Cloud Scale.
//
// ── WHY IDS ARE SELF-GENERATED UUIDS, NOT ROWIDS ─────────────────────────────
//
// Catalyst ROWIDs are 17 digits, exceeding Number.MAX_SAFE_INTEGER (16), and the
// Datastore row API returns ROWID as a RAW JSON NUMBER — so JSON.parse silently
// rounds it. Measured against the live datastore:
//
//   actual ROWID                  51859000000046006
//   JSON.parse of the row API     51859000000046010     <- wrong by 4
//
// ZCQL returns ROWID as a string and is exact, but rather than depend on that
// inconsistency we do not use ROWID as the logical id at all. Every row carries a
// note_uid uuid that WE generate. Consequences:
//
//   * the id is byte-identical on Turso and Catalyst, so porting is a pure
//     dialect change with no id translation layer,
//   * an insert can return immediately from values already in hand — no re-read,
//   * ROWID never reaches application code, so it cannot be rounded.
//
// ROWID is still needed for one thing: the row API's updateRow() addresses rows
// by it. That value is read back via ZCQL (exact, string) inside updateNote.
//
// See lib/catalyst.ts for the injection and tenancy constraints that dictate why
// writes use the row API and reads use ZCQL.
import type { Note } from './types'
import { randomUUID } from 'crypto'
import {
  zcql, catalystApp, safeUserId, CATALYST_NOTES_TABLE as T,
} from './catalyst'

// Identical to the app's Note — both backends key on a uuid we own, so there is
// no type divergence to paper over.
export type CatalystNote = Note

function toNote(r: Record<string, unknown>): CatalystNote {
  return {
    id: String(r.note_uid), // our uuid, never ROWID
    user_id: String(r.user_id),
    title: String(r.title ?? 'Untitled'),
    content: String(r.content ?? ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid note id: ${u}`)
  return u
}

/** Validates a ROWID read back from the datastore before it is inlined. */
function safeRowId(v: unknown): string {
  const s = String(v)
  if (!/^\d{1,20}$/.test(s)) throw new Error(`unexpected ROWID from datastore: ${s}`)
  return s
}

const COLS = 'note_uid, user_id, title, content, created_at, updated_at'

export async function getNotes(userId: string): Promise<CatalystNote[]> {
  const uid = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE user_id = '${uid}' ORDER BY updated_at DESC`,
  )
  return rows.map(toNote)
}

export async function getNote(userId: string, id: string): Promise<CatalystNote | null> {
  const uid = safeUserId(userId)
  const nuid = safeUuid(id)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${COLS} FROM ${T} WHERE note_uid = '${nuid}' AND user_id = '${uid}'`,
  )
  return rows.length ? toNote(rows[0]) : null
}

/**
 * Inserts via the object-based row API, because content is user-authored HTML and
 * ZCQL cannot bind parameters — inlining it would be an injection surface.
 *
 * Returns from the values already held. No re-read is needed since we generated
 * the id ourselves, and the insert response is not trusted anyway (its ROWID
 * arrives rounded).
 */
export async function createNote(userId: string, title: string, content: string): Promise<CatalystNote> {
  const uid = safeUserId(userId)
  const now = new Date().toISOString()
  const id = randomUUID()
  const safeTitle = title.slice(0, 255)       // varchar caps at 255
  const safeContent = content.slice(0, 10000) // text caps at 10000

  const table = (await catalystApp()).datastore().table(T)
  await table.insertRow({
    note_uid: id,
    user_id: uid,
    title: safeTitle,
    content: safeContent,
    created_at: now,
    updated_at: now,
  })

  return { id, user_id: uid, title: safeTitle, content: safeContent, created_at: now, updated_at: now }
}

/**
 * The ownership check and the ROWID lookup are the SAME tenant-scoped query: it
 * returns a row only if this user owns it. updateRow() addresses rows by ROWID
 * alone and would otherwise let one tenant overwrite another's note, so the query
 * both authorises the write and supplies its target.
 *
 * Returns silently on a foreign or missing row, so a caller cannot distinguish
 * "not yours" from "not found".
 */
export async function updateNote(
  userId: string, id: string, patch: { title?: string; content?: string },
): Promise<void> {
  const uid = safeUserId(userId)
  const nuid = safeUuid(id)

  const owned = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T} WHERE note_uid = '${nuid}' AND user_id = '${uid}'`,
  )
  if (owned.length === 0) return

  const row: Record<string, unknown> = {
    ROWID: safeRowId(owned[0].ROWID),
    updated_at: new Date().toISOString(),
  }
  if (patch.title !== undefined) row.title = patch.title.slice(0, 255)
  if (patch.content !== undefined) row.content = patch.content.slice(0, 10000)

  await (await catalystApp()).datastore().table(T).updateRow(row as never)
}

/**
 * Scoped ZCQL DELETE rather than deleteRow(): both inlined values are validated
 * (uuid, restricted-charset tenant id), so this is injection-safe AND enforces
 * tenancy in one round trip. deleteRow() takes a bare ROWID and would enforce
 * nothing.
 */
export async function deleteNote(userId: string, id: string): Promise<void> {
  const uid = safeUserId(userId)
  const nuid = safeUuid(id)
  await zcql(`DELETE FROM ${T} WHERE note_uid = '${nuid}' AND user_id = '${uid}'`)
}
