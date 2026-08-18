import { NextResponse } from 'next/server'
import { getDueNyabagam, markNyabagamNotified, getPushSubscriptionsForUser } from '@/lib/db'

export const dynamic = 'force-dynamic'

// This endpoint sweeps ALL users' due reminders in one pass, so it is not
// scoped to a caller. Each reminder is delivered ONLY to its own owner's
// devices — previously it fetched every subscription in the table and sent
// every reminder to all of them, which post-tenancy would mean every user
// receiving every other user's reminders.
//
// STILL OUTSTANDING (Plan 3): this route has no authentication of its own, and
// proxy.ts gates it, so platform cron invocations (which carry no cookies) are
// redirected to /login and it never fires. Fixing that needs a CRON_SECRET
// bearer check plus a proxy exemption, added together so the endpoint is never
// publicly reachable without the secret.
async function processNyabagam() {
  const items = await getDueNyabagam(2)
  if (items.length === 0) return NextResponse.json({ sent: 0 })

  const webpush = await import('web-push')
  webpush.default.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  // One lookup per distinct owner rather than per reminder.
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

// Client-side trigger
export async function POST() {
  return processNyabagam()
}

// Vercel cron trigger (GET)
export async function GET() {
  return processNyabagam()
}
