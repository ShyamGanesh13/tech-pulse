import { NextRequest, NextResponse } from 'next/server'
import { updateVaultFolder, softDeleteVaultFolder } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patch = await req.json()
  await updateVaultFolder(id, patch)
  return NextResponse.json({ ok: true })
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await softDeleteVaultFolder(id)
  return NextResponse.json({ ok: true })
}
