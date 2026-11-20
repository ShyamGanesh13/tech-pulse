import { NextRequest, NextResponse } from 'next/server'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'
// A 5-minute recording is not instant to transcribe; AppSail would cut a slow request.
export const maxDuration = 180

/** Groq's free-tier upload limit (19.5 MB). A 5-minute Opus recording is roughly 2–4 MB. */
const MAX_BYTES = 19.5 * 1024 * 1024

/**
 * Any OpenAI-compatible transcription endpoint. Groq's free tier by default;
 * switching provider (e.g. back to OpenAI whisper-1) is an env change, not code.
 */
const STT_URL = () => process.env.PATHIVU_STT_URL || 'https://api.groq.com/openai/v1/audio/transcriptions'
const STT_MODEL = () => process.env.PATHIVU_STT_MODEL || 'whisper-large-v3'

/** Dictation languages offered on the page (ISO-639-1). */
const LANGUAGES = new Set(['en', 'ta'])

/**
 * Whisper takes a prompt that steers spelling. This owner's dictation is full of
 * product and tooling names that speech-to-text reliably mangles ("zee-cue-ell",
 * "app sale"), and a mangled term in the transcript becomes a wrong word in the
 * journal. Extend it when a term keeps coming back wrong.
 */
const VOCABULARY =
  'Zoho, Zia, Catalyst, AppSail, ZCQL, Cloud Scale, Turso, Desk, PlatformAI, RAG, embeddings, LLM, Next.js, TypeScript, Qdrant, MCP, agentic'

/** Audio in (multipart `audio`), text out. Never answers with a silent empty
 *  transcript: a lost dictation has to be visible to the person who spoke it. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const key = process.env.PATHIVU_STT_KEY
  if (!key) return NextResponse.json({ error: 'Speech-to-text is not configured (PATHIVU_STT_KEY).' }, { status: 503 })

  let audio: File | null = null
  let language = 'en'
  try {
    const form = await req.formData()
    const part = form.get('audio')
    audio = part instanceof File ? part : null
    const lang = String(form.get('language') ?? 'en')
    if (LANGUAGES.has(lang)) language = lang
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with an "audio" file' }, { status: 400 })
  }
  if (!audio || audio.size === 0) return NextResponse.json({ error: 'No audio received' }, { status: 400 })
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'Recording is over 19.5 MB' }, { status: 413 })

  const body = new FormData()
  // The provider infers the format from the file name, so keep an extension that matches.
  const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm'
  body.append('file', audio, `dictation.${ext}`)
  body.append('model', STT_MODEL())
  body.append('response_format', 'json')
  body.append('language', language)
  // An English prompt steers Whisper toward English output, so Tamil gets none.
  if (language === 'en') body.append('prompt', VOCABULARY)

  let res: Response
  try {
    res = await fetch(STT_URL(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.timeout(150_000),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json({ error: timedOut ? 'Transcription timed out — try a shorter recording' : 'Could not reach the speech-to-text service' }, { status: 504 })
  }
  if (res.status === 429) {
    return NextResponse.json({ error: 'Voice limit reached — try again in a minute' }, { status: 429 })
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { error?: { message?: string } } | null
    console.error('[pathivu] transcription failed:', res.status, detail?.error?.message)
    return NextResponse.json({ error: `Transcription failed: ${detail?.error?.message ?? res.statusText}` }, { status: 502 })
  }

  const text = String(((await res.json()) as { text?: string }).text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Nothing was heard in that recording' }, { status: 422 })
  return NextResponse.json({ text })
}
