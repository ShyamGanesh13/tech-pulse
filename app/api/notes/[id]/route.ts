import { NextResponse } from 'next/server'
import { getNote, updateNote, deleteNote } from '@/lib/db'

export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => {
    const note = getNote(Number(id))
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(note)
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, body] = await Promise.all([params, req.json()])
  const patch: { title?: string; content?: string } = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.content === 'string') patch.content = body.content
  updateNote(Number(id), patch)
  const updated = getNote(Number(id))
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteNote(Number(id))
  return new NextResponse(null, { status: 204 })
}
