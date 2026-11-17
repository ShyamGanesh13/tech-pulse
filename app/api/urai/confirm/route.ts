import { NextRequest, NextResponse } from 'next/server'
import { getMessages, setMessageProposals, createNyabagam, createTodo, createNote } from '@/lib/data'
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

  if (p.kind === 'reminder') await createNyabagam(userId, p.title, null, p.remind_at)
  else if (p.kind === 'todo') await createTodo(userId, p.title, null, p.priority, p.due_date)
  else await createNote(userId, p.title, p.content)

  await setMessageProposals(userId, messageId, msg.sources, proposals.map((q, i) => (i === index ? { ...q, saved: true } : q)))
  return NextResponse.json({ ok: true })
}
