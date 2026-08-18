import { NextRequest, NextResponse } from 'next/server'
import { deleteNyabagam } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  // Ids are uuids now, not integers — a numeric parse would reject every valid id.
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteNyabagam(userId, id)
  return NextResponse.json({ ok: true })
}
