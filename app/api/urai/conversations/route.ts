import { NextResponse } from 'next/server'
import { listConversations, createConversation } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const conversations = await listConversations(userId)
  return NextResponse.json({ conversations })
}

export async function POST() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const conversation = await createConversation(userId)
  return NextResponse.json({ conversation }, { status: 201 })
}
