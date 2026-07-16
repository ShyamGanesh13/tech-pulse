import { NextResponse } from 'next/server'
import { getDueNyabagam, markNyabagamNotified, getPushSubscriptions } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function processNyabagam() {
  const items = await getDueNyabagam(2)
  if (items.length === 0) return NextResponse.json({ sent: 0 })

  const subscriptions = await getPushSubscriptions()
  if (subscriptions.length === 0) {
    // Mark as notified even with no subs to avoid re-queueing
    for (const r of items) await markNyabagamNotified(r.id)
    return NextResponse.json({ sent: 0, reason: 'no subscriptions' })
  }

  const webpush = await import('web-push')
  webpush.default.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  let sent = 0
  for (const item of items) {
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
