import { NextResponse } from 'next/server'
import { listConversations, createConversation } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const conversations = await listConversations()
  return NextResponse.json({ conversations })
}

export async function POST() {
  const conversation = await createConversation()
  return NextResponse.json({ conversation }, { status: 201 })
}
