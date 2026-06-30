import { NextRequest, NextResponse } from 'next/server'
import { savePushSubscription, deletePushSubscription } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  await savePushSubscription(endpoint, keys.p256dh, keys.auth)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  await deletePushSubscription(endpoint)
  return NextResponse.json({ ok: true })
}
