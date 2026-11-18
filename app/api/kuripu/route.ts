import { NextResponse, after } from 'next/server'
import { getNotes, createNote } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { noteTooLong, MAX_NOTE_CHARS, sweepOrphanImages } from '@/lib/kuripu-images'

/**
 * user id -> when their images were last swept. Images removed from a note by
 * editing are cleaned up here, on load, rather than on save: a save-time delete
 * would break undo (the image comes back as a dead link). On a fresh load there
 * is no undo history, and SWEEP_GRACE_MS covers another tab still editing.
 *
 * ponytail: in-memory, so per-instance and reset on deploy — that only means an
 * extra sweep, which is idempotent.
 */
const lastSwept = new Map<string, number>()
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000

export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const notes = await getNotes(userId)
  if (Date.now() - (lastSwept.get(userId) ?? 0) > SWEEP_EVERY_MS) {
    lastSwept.set(userId, Date.now())
    // After the response, so the note list never waits on storage.
    after(() => sweepOrphanImages(userId, notes.map(n => n.content))
      .then(n => { if (n) console.log(`[kuripu] swept ${n} unused image(s) for ${userId}`) })
      .catch(err => console.error('[kuripu] image sweep failed:', err)))
  }
  return NextResponse.json(notes)
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
