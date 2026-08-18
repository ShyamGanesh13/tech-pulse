import { NextRequest, NextResponse } from 'next/server'
import { getDueNyabagam, getDueNyabagamForUser, markNyabagamNotified, getPushSubscriptionsForUser } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import type { Nyabagam } from '@/lib/types'

export const dynamic = 'force-dynamic'

// This endpoint has TWO callers with different trust models, so it has two
// different auth paths:
//
//   GET  — the platform cron (vercel.json). Carries no cookies, so it
//          authenticates with a CRON_SECRET bearer token and sweeps EVERY
//          user's due reminders.
//   POST — the in-app trigger from app/components/PushNotifications.tsx. It has
//          a session cookie, so it authenticates as that user and processes
//          ONLY that user's reminders.
//
// proxy.ts exempts this path precisely because the cron cannot present a
// cookie; both handlers therefore authenticate themselves and must never be
// left to rely on the proxy gate.

// Each reminder is delivered ONLY to its own owner's devices. Previously this
// route fetched every subscription in the table and sent every reminder to all
// of them — post-tenancy that would mean every user receiving every other
// user's reminders.
async function deliver(items: Nyabagam[]) {
  if (items.length === 0) return NextResponse.json({ sent: 0 })

  const webpush = await import('web-push')
  webpush.default.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  // One lookup per distinct owner rather than one per reminder.
  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>()
  async function subsFor(uid: string) {
    let s = subsByUser.get(uid)
    if (!s) { s = await getPushSubscriptionsForUser(uid); subsByUser.set(uid, s) }
    return s
  }

  let sent = 0
  for (const item of items) {
    const subscriptions = await subsFor(item.user_id)
    if (subscriptions.length === 0) {
      // Mark notified even with no devices, so it does not re-queue forever.
      await markNyabagamNotified(item.id)
      continue
    }
    const payload = JSON.stringify({
      title: item.title,
      body: item.description ?? new Date(item.remind_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      tag: `ninaivu-${item.id}`,
      url: '/ninaivu',
    })
    for (const sub of subscriptions) {
      try {
        await webpush.default.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
      } catch (err: unknown) {
        // 410 Gone = subscription expired, ignore
        if ((err as { statusCode?: number }).statusCode !== 410) {
          console.error('Push send error:', err)
        }
      }
    }
    await markNyabagamNotified(item.id)
  }

  return NextResponse.json({ sent, nyabagam: items.length })
}

// In-app trigger: scoped to the signed-in caller.
export async function POST() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()
  return deliver(await getDueNyabagamForUser(userId, 2))
}

// Cron trigger: bearer-token authenticated, sweeps all users.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed. Without a configured secret there is no way to tell the cron
    // from an anonymous request, and this endpoint sends push notifications.
    console.error('[cron] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return deliver(await getDueNyabagam(2))
}
