import { NextRequest, NextResponse } from 'next/server'
import {
  getMessages, setMessageProposals, createNyabagam, deleteNyabagam, createTodo, updateTodo, deleteTodo, createNote,
} from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Saves one of Urai's drafted proposals. The draft is read back from the stored
// message, not taken from the request, and is marked saved afterwards: the chip
// survives a reload, and a second tap (or a reload mid-save) can't save twice.
export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { conversationId, messageId, index } = await req.json()
  if (typeof conversationId !== 'string' || typeof messageId !== 'string' || !Number.isInteger(index)) {
    return NextResponse.json({ error: 'conversationId, messageId and index are required' }, { status: 400 })
  }

  const msg = (await getMessages(userId, conversationId)).find(m => m.id === messageId)
  const proposals = msg?.proposals ?? []
  const p = proposals[index]
  if (!msg || !p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (p.saved) return NextResponse.json({ ok: true, already: true })

  // Every write is tenant-scoped by the facade; an edit to an item deleted since
  // it was drafted is a silent no-op there, which is the right outcome.
  switch (p.kind) {
    case 'reminder': await createNyabagam(userId, p.title, null, p.remind_at); break
    case 'todo': await createTodo(userId, p.title, null, p.priority, p.due_date); break
    case 'note': await createNote(userId, p.title, p.content); break
    case 'todo_update': await updateTodo(userId, p.id, p.patch); break
    case 'todo_delete': await deleteTodo(userId, p.id); break
    case 'reminder_update':
      // No in-place update exists for reminders: create the new one first, so a
      // failure in between leaves a duplicate rather than nothing.
      await createNyabagam(userId, p.title, p.description, p.remind_at)
      await deleteNyabagam(userId, p.id)
      break
    case 'reminder_delete': await deleteNyabagam(userId, p.id); break
  }

  await setMessageProposals(userId, messageId, msg.sources, proposals.map((q, i) => (i === index ? { ...q, saved: true } : q)))
  return NextResponse.json({ ok: true })
}
