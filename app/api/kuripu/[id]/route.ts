import { NextResponse } from 'next/server'
import { getNote, updateNote, deleteNote } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const note = await getNote(userId, id)
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(note)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const [{ id }, body] = await Promise.all([params, req.json()])
  const patch: { title?: string; content?: string; pinned_at?: string | null } = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.content === 'string') patch.content = body.content
  // null clears the pin, a string sets it; anything else is ignored.
  if (body.pinned_at === null || typeof body.pinned_at === 'string') patch.pinned_at = body.pinned_at
  await updateNote(userId, id, patch)
  const updated = await getNote(userId, id)
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  await deleteNote(userId, id)
  return new NextResponse(null, { status: 204 })
}
