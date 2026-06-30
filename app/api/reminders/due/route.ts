import { NextResponse } from 'next/server'
import { getDueReminders, markReminderNotified, getPushSubscriptions } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function processReminders() {
  const reminders = await getDueReminders(2)
  if (reminders.length === 0) return NextResponse.json({ sent: 0 })

  const subscriptions = await getPushSubscriptions()
  if (subscriptions.length === 0) {
    // Mark as notified even with no subs to avoid re-queueing
    for (const r of reminders) await markReminderNotified(r.id)
    return NextResponse.json({ sent: 0, reason: 'no subscriptions' })
  }

  const webpush = await import('web-push')
  webpush.default.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  let sent = 0
  for (const reminder of reminders) {
    const payload = JSON.stringify({
      title: reminder.title,
      body: reminder.description ?? new Date(reminder.remind_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      tag: `reminder-${reminder.id}`,
      url: '/reminders',
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
    await markReminderNotified(reminder.id)
  }

  return NextResponse.json({ sent, reminders: reminders.length })
}

// Client-side trigger
export async function POST() {
  return processReminders()
}

// Vercel cron trigger (GET)
export async function GET() {
  return processReminders()
}
