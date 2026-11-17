import { NextRequest, NextResponse } from 'next/server'
import { runFetch } from '../../../../scripts/fetch'
import {
  getPushSubscribedUserIds, getPushSubscriptionsForUser, deletePushSubscription,
  getFeedPrefs, getArticles,
} from '@/lib/data'
import { buildDigest, istDate } from '@/lib/digest'

export const dynamic = 'force-dynamic'

// Thagaval morning digest. Cron-only: a CRON_SECRET bearer token, no session.
// proxy.ts exempts this path because a cron carries no cookie, so the handler
// authenticates itself and must never be left to rely on the proxy gate.
//
// This is the one scheduled fetch path, kept narrow on purpose — see
// docs/cron-job.md. Only users with a push subscription are touched, tenants
// run one at a time, and the run stops starting new ones at BUDGET_MS.

/**
 * Stop STARTING tenants after this long. A tenant's refresh takes ~10s, so the
 * last one started can still finish inside AppSail's request timeout.
 */
const BUDGET_MS = 40_000

/**
 * user id -> IST date their digest was last handled (sent, or nothing to send).
 *
 * ponytail: in-memory, so it is per-instance and lost on restart — a second
 * cron fire after a redeploy, or one landing on another instance, sends again
 * (the per-day notification tag makes that replace, not stack). Upgrade path: a
 * `last_digest_at` column on user_feed_prefs.
 */
const handledOn = new Map<string, string>()

type WebPush = typeof import('web-push')

/** 'sent' and 'empty' are final for the day; 'failed' is retried by a later run. */
async function digestFor(userId: string, day: string, webpush: WebPush): Promise<'sent' | 'empty' | 'failed'> {
  // Fails closed, like POST /api/refresh: an unreadable preference row throws
  // here rather than falling back to fetching the whole catalogue.
  const prefs = await getFeedPrefs(userId)
  const result = await runFetch({ userId, ...prefs })
  // Zero kept covers both "nothing on-topic" and "every source failed" — the
  // latter leaves yesterday's rows in place, which must not go out as today's.
  if (result.total === 0) {
    console.log(`[digest] ${userId}: skipped — refresh kept nothing (failed sources: ${result.failed.join(', ') || 'none'})`)
    return 'empty'
  }

  const payload = buildDigest(await getArticles(userId, 'all', 200), day)
  if (!payload) {
    console.log(`[digest] ${userId}: skipped — no on-topic stories`)
    return 'empty'
  }

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
        console.error(`[digest] ${userId}: push send error:`, err)
      }
    }
  }
  if (delivered === 0) {
    console.log(`[digest] ${userId}: skipped — no deliverable subscription`)
    return 'failed'
  }
  return 'sent'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed: without a secret the cron is indistinguishable from an
    // anonymous request, and this endpoint fetches and sends pushes.
    console.error('[digest] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const day = istDate()
  const pending = (await getPushSubscribedUserIds()).filter(id => handledOn.get(id) !== day)

  const webpush = (await import('web-push')).default
  if (pending.length > 0) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )
  }

  let processed = 0, sent = 0, skipped = 0
  for (const userId of pending) {
    if (Date.now() - started > BUDGET_MS) break
    processed++
    try {
      const outcome = await digestFor(userId, day, webpush)
      if (outcome === 'sent') sent++
      else skipped++
      if (outcome !== 'failed') handledOn.set(userId, day)
    } catch (err) {
      // One tenant's failure must not stop the rest.
      skipped++
      console.error(`[digest] ${userId}: FAILED:`, err instanceof Error ? err.stack ?? err.message : err)
    }
  }

  const summary = { processed, sent, skipped, remaining: pending.length - processed }
  console.log('[digest]', JSON.stringify(summary))
  return NextResponse.json(summary)
}
