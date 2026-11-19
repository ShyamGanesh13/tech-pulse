import { NextRequest, NextResponse } from 'next/server'
import { getPathivu } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { istDate, polishMessages } from '@/lib/pathivu'
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Dictation in, draft out. Does not save: the person edits the draft first.
 *
 * Never blocks on the AI. Without PlatformAI (local dev, an outage) the raw text
 * comes back as the draft with `polished: false`, and the day can still be saved.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  let body: { text?: unknown; entry_date?: unknown; merge?: unknown; existing?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  const day = typeof body.entry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date) ? body.entry_date : istDate()

  // Merge into what the day already holds, so a second dictation extends the
  // entry instead of replacing it in the draft. The editor's current text wins
  // when sent: it may hold unsaved edits that the stored entry doesn't.
  const existing = body.merge === false
    ? null
    : typeof body.existing === 'string' ? body.existing : (await getPathivu(userId, day))?.content ?? null

  if (!platformAIConfigured()) return NextResponse.json({ draft: joinPlain(existing, text), polished: false })
  try {
    const draft = (await platformAIChat({ messages: polishMessages(text, existing) })).trim()
    if (!draft) throw new Error('empty polish')
    return NextResponse.json({ draft, polished: true })
  } catch (err) {
    console.error('[pathivu] polish failed:', err)
    return NextResponse.json({ draft: joinPlain(existing, text), polished: false })
  }
}

/** The no-AI fallback: the dictation appended under what was there. */
function joinPlain(existing: string | null, text: string): string {
  return existing?.trim() ? `${existing.trim()}\n\n${text}` : text
}
