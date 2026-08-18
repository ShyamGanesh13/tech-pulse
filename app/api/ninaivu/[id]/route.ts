import { NextRequest, NextResponse } from 'next/server'
import { deleteNyabagam } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteNyabagam(userId, numId)
  return NextResponse.json({ ok: true })
}
