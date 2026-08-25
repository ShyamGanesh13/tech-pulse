import { NextRequest, NextResponse } from 'next/server'
import { updateVaultFolder, softDeleteVaultFolder } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const patch = await req.json()
  await updateVaultFolder(userId, id, patch)
  return NextResponse.json({ ok: true })
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  await softDeleteVaultFolder(userId, id)
  return NextResponse.json({ ok: true })
}
