import { NextRequest, NextResponse } from 'next/server'
import { savePushSubscription, deletePushSubscription } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  await savePushSubscription(userId, endpoint, keys.p256dh, keys.auth)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  await deletePushSubscription(userId, endpoint)
  return NextResponse.json({ ok: true })
}
