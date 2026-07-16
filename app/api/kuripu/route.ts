import { NextResponse } from 'next/server'
import { getNotes, createNote } from '@/lib/db'

export async function GET() {
  return NextResponse.json(await getNotes())
}

export async function POST(req: Request) {
  const body = await req.json()
  const title = (body.title as string | undefined)?.trim() || 'Untitled'
  const content = (body.content as string | undefined) ?? ''
  const note = await createNote(title, content)
  return NextResponse.json(note, { status: 201 })
}
