import { NextResponse } from 'next/server'
import { deleteTransaction } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  await deleteTransaction(userId, id)
  return new NextResponse(null, { status: 204 })
}
