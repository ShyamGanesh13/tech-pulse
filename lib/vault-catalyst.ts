// The vault, ported to Catalyst Cloud Scale.
//
// HIGHEST BLAST RADIUS IN THE APP. A scoping slip here exposes passwords rather
// than notes, and vault_meta holds the wrapped DEK — the key material that makes
// a user's items decryptable. Every statement below is tenant-scoped, and the
// row-API writes are all preceded by a scoped ownership read.
//
// What is NOT at risk: the ciphertext itself. Encryption and decryption happen in
// the browser; the server only ever holds `iv`, `ciphertext` and `wrapped_dek`, so
// even a total scoping failure would leak undecryptable blobs. That is defence in
// depth, not a reason to be careless.
//
// Catalyst specifics:
//   - vault_meta.user_id is UNIQUE, so the platform itself refuses a second vault
//     per tenant. Turso relied on user_id being the PRIMARY KEY for the same
//     guarantee; here it is enforced by the column constraint.
//   - There is no ON CONFLICT, so setVaultMeta does a scoped read then either an
//     insert or an update.
//   - `text` caps at 10000 chars. A single vault item's ciphertext is far smaller,
//     but a very long secure note could in principle approach it.
import type { VaultMetaRow, VaultItemRow, VaultFolderRow } from './types'
import { zcql, catalystApp, safeUserId } from './catalyst'

const T_META = 'vault_meta'
const T_ITEM = 'vault_items'
const T_FOLDER = 'vault_folders'

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid id: ${u}`)
  return u
}

function toMeta(r: Record<string, unknown>): VaultMetaRow {
  return {
    user_id: String(r.user_id),
    kdf_salt: String(r.kdf_salt),
    kdf_iterations: Number(r.kdf_iterations),
    wrapped_dek: String(r.wrapped_dek),
    created_at: String(r.created_at),
  }
}

function toItem(r: Record<string, unknown>): VaultItemRow {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    iv: String(r.iv),
    ciphertext: String(r.ciphertext),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    deleted_at: r.deleted_at == null ? null : String(r.deleted_at),
  }
}

function toFolder(r: Record<string, unknown>): VaultFolderRow {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    parent_id: r.parent_uid == null ? null : String(r.parent_uid),
    iv: String(r.iv),
    name_ct: String(r.name_ct),
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at),
    deleted_at: r.deleted_at == null ? null : String(r.deleted_at),
  }
}

const META_COLS = 'user_id, kdf_salt, kdf_iterations, wrapped_dek, created_at'
const ITEM_COLS = 'uid, user_id, iv, ciphertext, created_at, updated_at, deleted_at'
const FOLDER_COLS = 'uid, user_id, parent_uid, iv, name_ct, sort_order, created_at, deleted_at'

// ── Meta (key material) ─────────────────────────────────────────────────────

export async function getVaultMeta(userId: string): Promise<VaultMetaRow | null> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${META_COLS} FROM ${T_META} WHERE user_id = '${owner}'`, T_META,
  )
  return rows.length ? toMeta(rows[0]) : null
}

/**
 * No ON CONFLICT on Catalyst, so this reads its own row first and then inserts or
 * updates. The read is tenant-scoped, so it can only ever find this user's vault —
 * meaning the update path cannot be steered onto someone else's key material.
 */
export async function setVaultMeta(
  userId: string, m: { kdf_salt: string; kdf_iterations: number; wrapped_dek: string },
): Promise<void> {
  const owner = safeUserId(userId)
  const existing = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_META} WHERE user_id = '${owner}'`, T_META,
  )
  const table = (await catalystApp()).datastore().table(T_META)
  if (existing.length > 0) {
    await table.updateRow({
      ROWID: String(existing[0].ROWID),
      kdf_salt: m.kdf_salt,
      kdf_iterations: m.kdf_iterations,
      wrapped_dek: m.wrapped_dek,
    } as never)
    return
  }
  await table.insertRow({
    user_id: owner,
    kdf_salt: m.kdf_salt,
    kdf_iterations: m.kdf_iterations,
    wrapped_dek: m.wrapped_dek,
    created_at: new Date().toISOString(),
  })
}

// ── Items ───────────────────────────────────────────────────────────────────

export async function getVaultItems(userId: string, includeDeleted = false): Promise<VaultItemRow[]> {
  const owner = safeUserId(userId)
  const where = includeDeleted
    ? `user_id = '${owner}'`
    : `user_id = '${owner}' AND deleted_at is null`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ITEM_COLS} FROM ${T_ITEM} WHERE ${where} ORDER BY updated_at DESC`, T_ITEM,
  )
  return rows.map(toItem)
}

export async function createVaultItem(
  userId: string, row: { id: string; iv: string; ciphertext: string },
): Promise<VaultItemRow> {
  const owner = safeUserId(userId)
  const id = safeUuid(row.id)   // the client supplies the uuid for vault items
  const now = new Date().toISOString()
  await (await catalystApp()).datastore().table(T_ITEM).insertRow({
    uid: id, user_id: owner, iv: row.iv, ciphertext: row.ciphertext,
    created_at: now, updated_at: now, deleted_at: null,
  })
  return { id, user_id: owner, iv: row.iv, ciphertext: row.ciphertext, created_at: now, updated_at: now, deleted_at: null }
}

/** Resolves an item's ROWID only if this tenant owns it. */
async function ownedItemRowId(owner: string, id: string): Promise<string | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_ITEM} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_ITEM,
  )
  return rows.length ? String(rows[0].ROWID) : null
}

export async function updateVaultItem(userId: string, id: string, iv: string, ciphertext: string): Promise<void> {
  const owner = safeUserId(userId)
  const rowId = await ownedItemRowId(owner, id)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_ITEM).updateRow({
    ROWID: rowId, iv, ciphertext, updated_at: new Date().toISOString(),
  } as never)
}

export async function softDeleteVaultItem(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  const rowId = await ownedItemRowId(owner, id)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_ITEM).updateRow({
    ROWID: rowId, deleted_at: new Date().toISOString(),
  } as never)
}

export async function restoreVaultItem(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  const rowId = await ownedItemRowId(owner, id)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_ITEM).updateRow({
    ROWID: rowId, deleted_at: null,
  } as never)
}

export async function hardDeleteVaultItem(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  await zcql(`DELETE FROM ${T_ITEM} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_ITEM)
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function getVaultFolders(userId: string, includeDeleted = false): Promise<VaultFolderRow[]> {
  const owner = safeUserId(userId)
  const where = includeDeleted
    ? `user_id = '${owner}'`
    : `user_id = '${owner}' AND deleted_at is null`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${FOLDER_COLS} FROM ${T_FOLDER} WHERE ${where} ORDER BY sort_order ASC`, T_FOLDER,
  )
  return rows.map(toFolder)
}

export async function createVaultFolder(
  userId: string,
  row: { id: string; parent_id: string | null; iv: string; name_ct: string; sort_order: number },
): Promise<VaultFolderRow> {
  const owner = safeUserId(userId)
  const id = safeUuid(row.id)
  const now = new Date().toISOString()
  await (await catalystApp()).datastore().table(T_FOLDER).insertRow({
    uid: id, user_id: owner, parent_uid: row.parent_id, iv: row.iv,
    name_ct: row.name_ct, sort_order: row.sort_order, created_at: now, deleted_at: null,
  })
  return { ...row, user_id: owner, created_at: now, deleted_at: null }
}

export async function updateVaultFolder(
  userId: string, id: string,
  patch: { parent_id?: string | null; iv?: string; name_ct?: string; sort_order?: number },
): Promise<void> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_FOLDER} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_FOLDER,
  )
  if (rows.length === 0) return
  const row: Record<string, unknown> = { ROWID: String(rows[0].ROWID) }
  if (patch.parent_id !== undefined) row.parent_uid = patch.parent_id
  if (patch.iv !== undefined) row.iv = patch.iv
  if (patch.name_ct !== undefined) row.name_ct = patch.name_ct
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order
  await (await catalystApp()).datastore().table(T_FOLDER).updateRow(row as never)
}

export async function softDeleteVaultFolder(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_FOLDER} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_FOLDER,
  )
  if (rows.length === 0) return
  await (await catalystApp()).datastore().table(T_FOLDER).updateRow({
    ROWID: String(rows[0].ROWID), deleted_at: new Date().toISOString(),
  } as never)
}
