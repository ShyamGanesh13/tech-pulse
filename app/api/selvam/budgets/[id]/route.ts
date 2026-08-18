import { NextResponse } from 'next/server'
import { deleteBudget } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  await deleteBudget(userId, id)
  return new NextResponse(null, { status: 204 })
}
