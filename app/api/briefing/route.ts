import { NextRequest, NextResponse } from 'next/server'
import { runFetch } from '../../../scripts/fetch'
import {
  getPushSubscribedUserIds, getPushSubscriptionsForUser, deletePushSubscription,
  getFeedPrefs, getArticles, getTodos, getNyabagamByDate, getTransactions, getTransactionSummary, getBudgets,
  listConversations, createConversation, renameConversation, addMessage,
} from '@/lib/data'
import {
  istDate, addDays, briefingTitle, briefingStories, splitTodos, overdueDrafts, isEmpty,
  briefingFacts, fallbackBriefing, briefingPush, type BriefingData,
} from '@/lib/briefing'
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai'
import { URAI_CONVERSATION_PARAM } from '@/lib/article-actions'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Urai's morning briefing. Cron-only: a CRON_SECRET bearer token, no session.
// proxy.ts exempts this path because a cron carries no cookie, so the handler
// authenticates itself and must never be left to rely on the proxy gate.
//
// Per opted-in user (a push subscription is the opt-in): refresh their feed,
// gather today from Ninaivu, Selvam and Thagaval, write it as a Urai chat with
// "move to today" drafts for overdue to-dos, and push a line that opens it.
// It is also the one scheduled fetch path, kept narrow on purpose — see
// docs/cron-job.md. Tenants run one at a time and the run stops starting new
// ones at BUDGET_MS.

/**
 * Stop STARTING tenants after this long. A tenant's refresh takes ~10s, so the
 * last one started can still finish inside AppSail's request timeout.
 */
const BUDGET_MS = 40_000

type WebPush = typeof import('web-push')

const SYSTEM =
  'You are Urai, writing the user\'s morning briefing inside their productivity dashboard. ' +
  'From the facts given, write a short, warm briefing in Markdown: a one-line greeting, then what\'s on today, ' +
  'anything overdue, money (Indian rupees, ₹) and the top stories as links. Under 120 words. Use only the facts ' +
  'given; skip a section that has nothing. Mention that overdue items can be moved with the buttons below, but never ' +
  'say whether anything is saved. No sign-off.'

async function gather(userId: string, day: string): Promise<BriefingData> {
  // The feed refresh is best-effort: a failure costs the stories, not the briefing.
  // Zero kept covers "every source failed", which leaves yesterday's rows in
  // place — those must not go out as today's stories.
  let fresh = false
  try {
    fresh = (await runFetch({ userId, ...(await getFeedPrefs(userId)) })).total > 0
  } catch (err) {
    console.error(`[briefing] ${userId}: feed refresh failed:`, err)
  }

  const month = day.slice(0, 7)
  const yesterday = addDays(day, -1)
  const [todos, reminders, articles, summary, budgets, ydayTxns] = await Promise.all([
    getTodos(userId),
    getNyabagamByDate(userId, day),
    fresh ? getArticles(userId, 'all', 200) : Promise.resolve([]),
    getTransactionSummary(userId, month),
    getBudgets(userId, month),
    getTransactions(userId, { month: yesterday.slice(0, 7), type: 'debit' }),
  ])
  const budget = budgets.reduce((s, b) => s + Number(b.amount || 0), 0)
  return {
    day,
    ...splitTodos(todos, day),
    reminders,
    money: summary.count || budget
      ? {
          yesterday: ydayTxns.filter(t => t.date === yesterday && t.type === 'debit').reduce((s, t) => s + t.amount, 0),
          monthToDate: summary.debit,
          budget: budget || null,
        }
      : null,
    stories: briefingStories(articles),
  }
}

/** Today's briefing chat, if already written. Its title is the day, which makes
 *  this the durable once-a-day guard: it survives restarts and repeat cron fires. */
async function existingBriefing(userId: string, day: string): Promise<string | undefined> {
  return (await listConversations(userId)).find(c => c.title === briefingTitle(day))?.id
}

/** Writes today's briefing chat; null when there is nothing to brief. */
async function writeBriefing(userId: string, day: string): Promise<{ convId: string; data: BriefingData } | null> {
  const data = await gather(userId, day)
  if (isEmpty(data)) return null

  let text = ''
  if (platformAIConfigured()) {
    text = (await platformAIChat({
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: briefingFacts(data) }],
    }).catch(err => { console.error(`[briefing] ${userId}: AI failed:`, err); return null })) ?? ''
  }
  text = text.trim() || fallbackBriefing(data)

  const conv = await createConversation(userId)
  await renameConversation(userId, conv.id, briefingTitle(day))
  const proposals = overdueDrafts(data.overdue, day)
  await addMessage(userId, conv.id, 'assistant', text, data.stories.length ? data.stories : null, proposals)
  return { convId: conv.id, data }
}

/** 'sent' and 'empty' are final for the day; 'failed' is retried by a later run. */
async function briefingFor(userId: string, day: string, webpush: WebPush): Promise<'sent' | 'empty' | 'failed'> {
  if (await existingBriefing(userId, day)) return 'empty'
  const written = await writeBriefing(userId, day)
  if (!written) {
    console.log(`[briefing] ${userId}: skipped — nothing to brief`)
    return 'empty'
  }

  const payload = briefingPush(written.data, `/urai?${URAI_CONVERSATION_PARAM}=${encodeURIComponent(written.convId)}`)
  // This user's devices only.
  let delivered = 0
  for (const sub of await getPushSubscriptionsForUser(userId)) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
      delivered++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 410 || status === 404) {
        // Dead subscription. Removed, not just ignored: a subscription is the
        // opt-in here, so a stale one would keep buying a daily fetch for a
        // device that can no longer receive it.
        await deletePushSubscription(userId, sub.endpoint).catch(() => {})
      } else {
        console.error(`[briefing] ${userId}: push send error:`, err)
      }
    }
  }
  // The chat exists either way, so even an undelivered push is final for today:
  // the briefing is waiting in Urai, and a retry would only be skipped by the
  // title check above.
  if (delivered === 0) console.log(`[briefing] ${userId}: written, but no deliverable subscription`)
  return delivered ? 'sent' : 'failed'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed: without a secret the cron is indistinguishable from an
    // anonymous request, and this endpoint fetches and sends pushes.
    console.error('[briefing] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const day = istDate()
  const users = await getPushSubscribedUserIds()

  const webpush = (await import('web-push')).default
  if (users.length > 0) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )
  }

  let processed = 0, sent = 0, skipped = 0
  for (const userId of users) {
    if (Date.now() - started > BUDGET_MS) break
    processed++
    try {
      if ((await briefingFor(userId, day, webpush)) === 'sent') sent++
      else skipped++
    } catch (err) {
      // One tenant's failure must not stop the rest.
      skipped++
      console.error(`[briefing] ${userId}: FAILED:`, err instanceof Error ? err.stack ?? err.message : err)
    }
  }

  const summary = { processed, sent, skipped, remaining: users.length - processed }
  console.log('[briefing]', JSON.stringify(summary))
  return NextResponse.json(summary)
}

/**
 * The signed-in user's own briefing, on demand (Home's "Daily briefing" card):
 * today's chat if it exists, else written now. No push — the caller is looking.
 * Session-authenticated here, since proxy.ts exempts this path for the cron GET.
 */
export async function POST() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()
  const day = istDate()
  const existing = await existingBriefing(userId, day)
  if (existing) return NextResponse.json({ conversationId: existing })
  const written = await writeBriefing(userId, day)
  return NextResponse.json({ conversationId: written?.convId ?? null })
}
