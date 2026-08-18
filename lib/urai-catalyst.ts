// Urai conversations and messages, ported to Catalyst Cloud Scale.
//
// Column-name mappings forced by Catalyst, kept invisible to callers:
//   role            -> msg_role          (`role` risks the reserved-word list)
//   conversation_id -> conversation_uid  (holds the parent's UUID, not a FK)
//
// NO CASCADE BY DESIGN. Catalyst supports ON-DELETE-CASCADE, but only on foreign
// key columns, and FK columns reference ROWID — a 17-digit value that cannot
// survive a JS number (the row API returns it as a raw JSON number which
// JSON.parse rounds). Keeping the parent's uuid instead keeps ROWID out of the
// data model entirely; the cost is that deleteConversation issues two scoped
// deletes rather than relying on the platform. Both were already tenant-scoped in
// the Turso implementation, so nothing is lost but the convenience.
//
// `sources` is a JSON array serialised by the app. ZCQL has no JSON functions, so
// it is opaque text here and is never queried into.
import type { UraiConversation, UraiMessage, UraiSource } from './types'
import { randomUUID } from 'crypto'
import { zcql, catalystApp, safeUserId } from './catalyst'

const T_CONV = 'urai_conversations'
const T_MSG = 'urai_messages'

function safeUuid(u: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(u)) throw new Error(`invalid id: ${u}`)
  return u
}

function toConv(r: Record<string, unknown>): UraiConversation {
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    title: String(r.title ?? 'New chat'),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

function toMsg(r: Record<string, unknown>): UraiMessage {
  let sources: UraiSource[] | null = null
  if (r.sources) {
    try { sources = JSON.parse(String(r.sources)) as UraiSource[] } catch { sources = null }
  }
  return {
    id: String(r.uid),
    user_id: String(r.user_id),
    conversation_id: String(r.conversation_uid),
    role: String(r.msg_role) as UraiMessage['role'],
    content: String(r.content ?? ''),
    sources,
    created_at: String(r.created_at),
  }
}

const CONV_COLS = 'uid, user_id, title, created_at, updated_at'
const MSG_COLS = 'uid, user_id, conversation_uid, msg_role, content, sources, created_at'

export async function listConversations(userId: string): Promise<UraiConversation[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${CONV_COLS} FROM ${T_CONV} WHERE user_id = '${owner}' ORDER BY updated_at DESC`, T_CONV,
  )
  return rows.map(toConv)
}

export async function getConversation(userId: string, id: string): Promise<UraiConversation | null> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${CONV_COLS} FROM ${T_CONV} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_CONV,
  )
  return rows.length ? toConv(rows[0]) : null
}

export async function createConversation(userId: string, title = 'New chat'): Promise<UraiConversation> {
  const owner = safeUserId(userId)
  const now = new Date().toISOString()
  const id = randomUUID()
  await (await catalystApp()).datastore().table(T_CONV).insertRow({
    uid: id, user_id: owner, title: title.slice(0, 255), created_at: now, updated_at: now,
  })
  return { id, user_id: owner, title, created_at: now, updated_at: now }
}

/** Resolves a conversation's ROWID only if this tenant owns it. */
async function ownedConvRowId(owner: string, id: string): Promise<string | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_CONV} WHERE uid = '${safeUuid(id)}' AND user_id = '${owner}'`, T_CONV,
  )
  return rows.length ? String(rows[0].ROWID) : null
}

export async function renameConversation(userId: string, id: string, title: string): Promise<void> {
  const owner = safeUserId(userId)
  const rowId = await ownedConvRowId(owner, id)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_CONV).updateRow({
    ROWID: rowId, title: title.slice(0, 255), updated_at: new Date().toISOString(),
  } as never)
}

export async function touchConversation(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  const rowId = await ownedConvRowId(owner, id)
  if (!rowId) return
  await (await catalystApp()).datastore().table(T_CONV).updateRow({
    ROWID: rowId, updated_at: new Date().toISOString(),
  } as never)
}

/**
 * Two scoped deletes, messages first. There is no cascade (see the header), and
 * doing messages first means a failure between the two leaves orphaned parents
 * rather than orphaned children — a conversation with no messages is harmless and
 * visible, whereas messages with no parent would be invisible and undeletable.
 */
export async function deleteConversation(userId: string, id: string): Promise<void> {
  const owner = safeUserId(userId)
  const cid = safeUuid(id)
  await zcql(`DELETE FROM ${T_MSG} WHERE conversation_uid = '${cid}' AND user_id = '${owner}'`, T_MSG)
  await zcql(`DELETE FROM ${T_CONV} WHERE uid = '${cid}' AND user_id = '${owner}'`, T_CONV)
}

export async function getMessages(userId: string, conversationId: string): Promise<UraiMessage[]> {
  const owner = safeUserId(userId)
  // Filters on the denormalised user_id directly — no join needed, which matters
  // because ZCQL cannot join without a declared FK relationship.
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${MSG_COLS} FROM ${T_MSG}
     WHERE conversation_uid = '${safeUuid(conversationId)}' AND user_id = '${owner}'
     ORDER BY created_at ASC`, T_MSG,
  )
  return rows.map(toMsg)
}

export async function addMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources: UraiSource[] | null = null,
): Promise<UraiMessage> {
  const owner = safeUserId(userId)
  const convId = safeUuid(conversationId)
  const now = new Date().toISOString()
  const id = randomUUID()

  // Content is user-authored and sources is JSON, so both go through the
  // object-based row API rather than being inlined into ZCQL.
  await (await catalystApp()).datastore().table(T_MSG).insertRow({
    uid: id,
    user_id: owner,
    conversation_uid: convId,
    msg_role: role,
    content: content.slice(0, 10000),
    sources: sources ? JSON.stringify(sources).slice(0, 10000) : null,
    created_at: now,
  })
  await touchConversation(owner, convId)
  return { id, user_id: owner, conversation_id: convId, role, content, sources, created_at: now }
}
