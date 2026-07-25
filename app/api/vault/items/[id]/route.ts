import { NextRequest, NextResponse } from 'next/server'
import { updateVaultItem, softDeleteVaultItem, hardDeleteVaultItem, restoreVaultItem } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { iv, ciphertext } = await req.json()
  if (!iv || !ciphertext) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  await updateVaultItem(id, iv, ciphertext)
  return NextResponse.json({ ok: true })
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  if (url.searchParams.get('hard') === '1') await hardDeleteVaultItem(id)
  else if (url.searchParams.get('restore') === '1') await restoreVaultItem(id)
  else await softDeleteVaultItem(id)
  return NextResponse.json({ ok: true })
}
