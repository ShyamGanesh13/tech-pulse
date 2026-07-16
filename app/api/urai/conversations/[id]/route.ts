import { NextRequest, NextResponse } from 'next/server'
import { getConversation, getMessages, renameConversation, deleteConversation } from '@/lib/db'

export const dynamic = 'force-dynamic'

function parseId(id: string): number | null {
  const n = parseInt(id, 10)
  return isNaN(n) ? null : n
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseId(id)
  if (numId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const conversation = await getConversation(numId)
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const messages = await getMessages(numId)
  return NextResponse.json({ conversation, messages })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseId(id)
  if (numId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const { title } = await req.json()
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  await renameConversation(numId, title.trim().slice(0, 200))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseId(id)
  if (numId === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteConversation(numId)
  return NextResponse.json({ ok: true })
}
