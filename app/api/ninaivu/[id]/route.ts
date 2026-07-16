import { NextRequest, NextResponse } from 'next/server'
import { deleteNyabagam } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteNyabagam(numId)
  return NextResponse.json({ ok: true })
}
