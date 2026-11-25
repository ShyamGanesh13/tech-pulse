import { NextRequest, NextResponse, after } from 'next/server'
import {
  addMessage, createConversation, getConversation, renameConversation, getPushSubscriptionsForUser,
} from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { runResearch, researchConfigured, splitParts, PART_MAX } from '@/lib/research'
import { markdownToNoteHtml } from '@/lib/urai-tools'
import { URAI_CONVERSATION_PARAM } from '@/lib/article-actions'
import type { StoredProposal } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Urai's research mode. A run takes minutes (lib/research.ts), so POST only
// starts it: the work happens after the response, the chat polls GET for a status
// line, and the finished report lands in the conversation as ordinary assistant
// messages, each with a "save to Kuripu" draft. A push says when it is ready.

interface Part { content: string; proposal?: StoredProposal }
interface Run {
  userId: string
  status: string
  /** The finished report, not yet stored. Normally empty within a second. */
  parts?: Part[]
  storing?: boolean
}

/**
 * conversation id -> the run in flight.
 *
 * ponytail: in-memory, so a restart or redeploy mid-run loses that run (the
 * question stays in the chat, unanswered) and it assumes one AppSail instance.
 * A `research_runs` table is the upgrade if either starts to hurt.
 */
const runs = new Map<string, Run>()

/** Cuts the report into messages whose note draft fits the 10000-char columns
 *  (HTML and JSON escaping grow it), shrinking the parts until every one does. */
function toParts(title: string, report: string): Part[] {
  for (let max = PART_MAX; ; max -= 1000) {
    const texts = splitParts(report, max)
    const parts = texts.map((content, i): Part => ({
      content,
      proposal: { kind: 'note', title: texts.length > 1 ? `${title} (${i + 1}/${texts.length})` : title, content: markdownToNoteHtml(content) },
    }))
    if (max <= 1500 || parts.every(p => JSON.stringify(p.proposal).length <= 9000)) return parts
  }
}

/** Stores whatever is still unstored, one message at a time, so a failure
 *  half-way resumes there instead of writing the first parts twice. */
async function drain(convId: string, run: Run): Promise<void> {
  if (run.storing || !run.parts) return
  run.storing = true
  try {
    while (run.parts.length) {
      const p = run.parts[0]
      await addMessage(run.userId, convId, 'assistant', p.content, null, p.proposal ? [p.proposal] : null)
      run.parts.shift()
    }
    runs.delete(convId)
  } finally {
    run.storing = false
  }
}

async function notify(userId: string, convId: string, title: string, ok: boolean): Promise<void> {
  const subs = await getPushSubscriptionsForUser(userId)
  if (!subs.length || !process.env.VAPID_PRIVATE_KEY) return
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(process.env.VAPID_EMAIL!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({
    title: ok ? 'Research ready 🔭' : 'Research failed',
    body: title,
    tag: `research-${convId}`,
    url: `/urai?${URAI_CONVERSATION_PARAM}=${encodeURIComponent(convId)}`,
  })
  await Promise.allSettled(subs.map(s =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)))
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const topic = String(body.message ?? '').trim().slice(0, 2000)
  if (!topic) return NextResponse.json({ error: 'Give a topic to research.' }, { status: 400 })
  if (!researchConfigured()) return NextResponse.json({ error: 'No AI backend is configured, so research cannot run.' }, { status: 503 })
  // One at a time per user: a run is ~30 AI calls and two dozen page fetches.
  if ([...runs.values()].some(r => r.userId === userId)) {
    return NextResponse.json({ error: 'A research run is already in progress. Wait for it to finish.' }, { status: 409 })
  }

  const title = `Research: ${topic.replace(/\s+/g, ' ')}`.slice(0, 60)
  let convId: string = typeof body.conversationId === 'string' ? body.conversationId : ''
  if (convId) {
    if (!(await getConversation(userId, convId))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  } else {
    convId = (await createConversation(userId)).id
    await renameConversation(userId, convId, title)
  }
  await addMessage(userId, convId, 'user', topic)

  const run: Run = { userId, status: 'Planning the research…' }
  runs.set(convId, run)
  after(async () => {
    let ok = true
    try {
      const { report } = await runResearch(topic, { status: s => { run.status = s } })
      run.parts = toParts(title, report)
    } catch (err) {
      ok = false
      console.error('[research] FAILED:', err instanceof Error ? err.stack ?? err.message : err)
      const why = (err instanceof Error ? err.message : String(err)).slice(0, 200)
      run.parts = [{ content: `⚠ The research could not be completed: ${why}. Nothing was saved; send the topic again to retry.` }]
    }
    run.status = 'Saving the report…'
    // If this fails (the request's Catalyst credential is minutes old by now),
    // the parts stay on the run and the next status poll stores them instead.
    await drain(convId, run).catch(err => console.error('[research] could not store the report yet:', err))
    await notify(userId, convId, title, ok).catch(err => console.error('[research] push failed:', err))
  })

  return NextResponse.json({ conversationId: convId })
}

/** `?c=<conversation id>` -> { running, status }. Not running = reload the chat. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const convId = req.nextUrl.searchParams.get('c') ?? ''
  const run = runs.get(convId)
  if (!run || run.userId !== userId) return NextResponse.json({ running: false })
  if (run.parts) await drain(convId, run).catch(err => console.error('[research] could not store the report:', err))
  return NextResponse.json({ running: runs.has(convId), status: run.status })
}
