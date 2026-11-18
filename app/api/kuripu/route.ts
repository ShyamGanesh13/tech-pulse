import { NextResponse } from 'next/server'
import { getNotes, createNote } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { noteTooLong, MAX_NOTE_CHARS } from '@/lib/kuripu-images'

export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  return NextResponse.json(await getNotes(userId))
}

export async function POST(req: Request) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const body = await req.json()
  const title = (body.title as string | undefined)?.trim() || 'Untitled'
  const content = (body.content as string | undefined) ?? ''
  if (noteTooLong(content)) {
    return NextResponse.json({ error: `Note is over ${MAX_NOTE_CHARS.toLocaleString()} characters — not saved` }, { status: 413 })
  }
  const note = await createNote(userId, title, content)
  return NextResponse.json(note, { status: 201 })
}
