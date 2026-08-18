import { NextResponse } from 'next/server'
import { getNote, updateNote, deleteNote } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const note = await getNote(userId, Number(id))
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(note)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const [{ id }, body] = await Promise.all([params, req.json()])
  const patch: { title?: string; content?: string } = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.content === 'string') patch.content = body.content
  await updateNote(userId, Number(id), patch)
  const updated = await getNote(userId, Number(id))
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  await deleteNote(userId, Number(id))
  return new NextResponse(null, { status: 204 })
}
