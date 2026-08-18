// Users (the tenant registry) and push subscriptions, ported to Catalyst.
//
// WHY THIS MATTERS MORE THAN THE OTHER DOMAINS: `users` is the table every other
// table's user_id points at. Without it on Catalyst, Turso remains mandatory and
// the whole point of the migration — being Zoho-only — is not achieved. It was the
// last real dependency.
//
// Catalyst specifics handled here:
//   - `name` and `auth` are avoided as column names (display_name, auth_key).
//   - firebase_uid is deliberately NOT unique. The passcode admin account carries
//     a null firebase_uid, and whether Catalyst permits multiple nulls in a unique
//     index is not something I could verify cheaply. Uniqueness is instead
//     enforced by the resolution order in resolveGoogleUser: look up by
//     firebase_uid first, then by email, and only insert when both miss.
//   - push endpoints exceed the 255 varchar cap so they live in `text`, and text
//     columns cannot be unique — so a sha256 of user_id + endpoint carries the
//     uniqueness instead.
import type { User } from './types'
import { randomUUID, createHash } from 'crypto'
import { zcql, catalystApp, safeUserId } from './catalyst'

const T_USER = 'users'
const T_PUSH = 'push_subscriptions'

/** Emails are inlined into ZCQL, so restrict to what is safe and plausible. */
function safeEmail(e: string): string {
  const v = e.trim().toLowerCase()
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(v) || v.length > 255) {
    throw new Error(`invalid email: ${e}`)
  }
  return v
}

function safeFbUid(u: string): string {
  if (!/^[A-Za-z0-9_\-]{1,128}$/.test(u)) throw new Error(`invalid firebase uid: ${u}`)
  return u
}

function toUser(r: Record<string, unknown>): User {
  return {
    id: String(r.uid),
    email: String(r.email),
    firebase_uid: r.firebase_uid == null ? null : String(r.firebase_uid),
    name: r.display_name == null ? null : String(r.display_name),
    picture: r.picture == null ? null : String(r.picture),
    created_at: String(r.created_at),
    last_login_at: String(r.last_login_at),
  }
}

const USER_COLS = 'uid, email, firebase_uid, display_name, picture, created_at, last_login_at'

export async function getUserById(id: string): Promise<User | null> {
  if (!id) return null
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${USER_COLS} FROM ${T_USER} WHERE uid = '${safeUserId(id)}'`, T_USER,
  )
  return rows.length ? toUser(rows[0]) : null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${USER_COLS} FROM ${T_USER} WHERE email = '${safeEmail(email)}'`, T_USER,
  )
  return rows.length ? toUser(rows[0]) : null
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
  if (!firebaseUid) return null
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${USER_COLS} FROM ${T_USER} WHERE firebase_uid = '${safeFbUid(firebaseUid)}'`, T_USER,
  )
  return rows.length ? toUser(rows[0]) : null
}

export async function createUser(input: {
  email: string; firebase_uid: string | null; name: string | null; picture: string | null
}): Promise<User> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const email = safeEmail(input.email)
  await (await catalystApp()).datastore().table(T_USER).insertRow({
    uid: id, email, firebase_uid: input.firebase_uid,
    display_name: input.name, picture: input.picture,
    created_at: now, last_login_at: now,
  })
  return { id, email, firebase_uid: input.firebase_uid, name: input.name, picture: input.picture, created_at: now, last_login_at: now }
}

/** Resolves a user's ROWID by tenant id. */
async function userRowId(id: string): Promise<string | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_USER} WHERE uid = '${safeUserId(id)}'`, T_USER,
  )
  return rows.length ? String(rows[0].ROWID) : null
}

export async function linkFirebaseUid(userId: string, firebaseUid: string): Promise<void> {
  const rowId = await userRowId(userId)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_USER).updateRow({
    ROWID: rowId, firebase_uid: safeFbUid(firebaseUid),
  } as never)
}

export async function touchUserLogin(
  userId: string, patch: { email?: string; name?: string | null; picture?: string | null },
): Promise<void> {
  const rowId = await userRowId(userId)
  if (!rowId) return
  const row: Record<string, unknown> = { ROWID: rowId, last_login_at: new Date().toISOString() }
  if (patch.email !== undefined) row.email = safeEmail(patch.email)
  if (patch.name !== undefined) row.display_name = patch.name
  if (patch.picture !== undefined) row.picture = patch.picture
  await (await catalystApp()).datastore().table(T_USER).updateRow(row as never)
}

// ── Push subscriptions ──────────────────────────────────────────────────────

/** Uniqueness key: text columns cannot be unique, so the endpoint is hashed. */
function endpointHash(userId: string, endpoint: string): string {
  return createHash('sha256').update(`${userId}|${endpoint}`).digest('hex')
}

export async function savePushSubscription(
  userId: string, endpoint: string, p256dh: string, auth: string,
): Promise<void> {
  const owner = safeUserId(userId)
  const hash = endpointHash(owner, endpoint)
  const existing = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_PUSH} WHERE endpoint_hash = '${hash}'`, T_PUSH,
  )
  const table = (await catalystApp()).datastore().table(T_PUSH)
  if (existing.length > 0) {
    await table.updateRow({ ROWID: String(existing[0].ROWID), p256dh, auth_key: auth } as never)
    return
  }
  await table.insertRow({
    uid: randomUUID(), user_id: owner, endpoint, endpoint_hash: hash,
    p256dh, auth_key: auth, created_at: new Date().toISOString(),
  })
}

/** Per-user lookup so the cron delivers each reminder only to its owner. */
export async function getPushSubscriptionsForUser(
  userId: string,
): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT endpoint, p256dh, auth_key FROM ${T_PUSH} WHERE user_id = '${owner}'`, T_PUSH,
  )
  return rows.map(r => ({
    endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth_key),
  }))
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  const owner = safeUserId(userId)
  const hash = endpointHash(owner, endpoint)
  await zcql(`DELETE FROM ${T_PUSH} WHERE endpoint_hash = '${hash}' AND user_id = '${owner}'`, T_PUSH)
}

/**
 * Unscoped sweep for the reminder cron, which must see every tenant's due
 * reminders in one pass. Returns rows carrying user_id so the caller can route
 * each notification to its owner via getPushSubscriptionsForUser.
 */
export async function getDueNyabagam(windowMinutes = 2): Promise<Array<{ id: string; user_id: string; title: string; description: string | null; remind_at: string; created_at: string }>> {
  const now = new Date().toISOString()
  const past = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const rows = await zcql<Record<string, unknown>>(
    `SELECT uid, user_id, title, description, remind_at, created_at FROM nyabagam
     WHERE remind_at > '${past}' AND remind_at <= '${now}' AND notified_at is null`, 'nyabagam',
  )
  return rows.map(r => ({
    id: String(r.uid), user_id: String(r.user_id), title: String(r.title),
    description: r.description == null ? null : String(r.description),
    remind_at: String(r.remind_at), created_at: String(r.created_at),
  }))
}

/**
 * Scoped variant for the in-app trigger, which must only surface the CALLER'S own
 * due reminders. The unscoped sweep above exists solely for the cron.
 */
export async function getDueNyabagamForUser(userId: string, windowMinutes = 2): Promise<Array<{ id: string; user_id: string; title: string; description: string | null; remind_at: string; created_at: string }>> {
  const owner = safeUserId(userId)
  const now = new Date().toISOString()
  const past = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const rows = await zcql<Record<string, unknown>>(
    `SELECT uid, user_id, title, description, remind_at, created_at FROM nyabagam
     WHERE user_id = '${owner}' AND remind_at > '${past}' AND remind_at <= '${now}'
       AND notified_at is null`, 'nyabagam',
  )
  return rows.map(r => ({
    id: String(r.uid), user_id: String(r.user_id), title: String(r.title),
    description: r.description == null ? null : String(r.description),
    remind_at: String(r.remind_at), created_at: String(r.created_at),
  }))
}

/** Cron-only. The id comes from a row the cron just read, so it is not user input. */
export async function markNyabagamNotified(id: string): Promise<void> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM nyabagam WHERE uid = '${safeUserId(id)}'`, 'nyabagam',
  )
  if (rows.length === 0) return
  await (await catalystApp()).datastore().table('nyabagam').updateRow({
    ROWID: String(rows[0].ROWID), notified_at: new Date().toISOString(),
  } as never)
}
