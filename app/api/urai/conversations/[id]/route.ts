import { NextRequest, NextResponse } from 'next/server'
import { getConversation, getMessages, renameConversation, deleteConversation } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Ids are uuids now, not integers — a numeric parse would reject every valid id.
function parseId(id: string): string | null {
  return id && id.length > 0 ? id : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const convId = parseId(id)
  if (convId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const conversation = await getConversation(userId, convId)
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const messages = await getMessages(userId, convId)
  return NextResponse.json({ conversation, messages })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const convId = parseId(id)
  if (convId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const { title } = await req.json()
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  await renameConversation(userId, convId, title.trim().slice(0, 200))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const convId = parseId(id)
  if (convId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteConversation(userId, convId)
  return NextResponse.json({ ok: true })
}
