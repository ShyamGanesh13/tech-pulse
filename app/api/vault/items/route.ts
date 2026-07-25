import { NextRequest, NextResponse } from 'next/server'
import { getVaultItems, getVaultFolders, createVaultItem } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const trash = new URL(req.url).searchParams.get('trash') === '1'
  if (trash) {
    const all = await getVaultItems(true)
    return NextResponse.json({ items: all.filter(i => i.deleted_at) })
  }
  const [items, folders] = await Promise.all([getVaultItems(false), getVaultFolders(false)])
  return NextResponse.json({ items, folders })
}
export async function POST(req: NextRequest) {
  const { id, iv, ciphertext } = await req.json()
  if (!id || !iv || !ciphertext) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  const row = await createVaultItem({ id, iv, ciphertext })
  return NextResponse.json(row, { status: 201 })
}
