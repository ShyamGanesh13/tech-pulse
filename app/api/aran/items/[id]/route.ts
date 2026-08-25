import { NextRequest, NextResponse } from 'next/server'
import { updateVaultItem, softDeleteVaultItem, hardDeleteVaultItem, restoreVaultItem } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const { iv, ciphertext } = await req.json()
  if (!iv || !ciphertext) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  await updateVaultItem(userId, id, iv, ciphertext)
  return NextResponse.json({ ok: true })
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id } = await params
  const url = new URL(req.url)
  if (url.searchParams.get('hard') === '1') await hardDeleteVaultItem(userId, id)
  else if (url.searchParams.get('restore') === '1') await restoreVaultItem(userId, id)
  else await softDeleteVaultItem(userId, id)
  return NextResponse.json({ ok: true })
}
