import { NextRequest, NextResponse } from 'next/server'
import { updateTodo, deleteTodo } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  // Ids are uuids now, not integers — a numeric parse would reject every valid id.
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = await req.json()
  await updateTodo(userId, id, body)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  // Ids are uuids now, not integers — a numeric parse would reject every valid id.
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteTodo(userId, id)
  return NextResponse.json({ ok: true })
}
