import { NextRequest, NextResponse } from 'next/server'
import { getVaultItems, getVaultFolders, createVaultItem } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const trash = new URL(req.url).searchParams.get('trash') === '1'
  if (trash) {
    const all = await getVaultItems(userId, true)
    return NextResponse.json({ items: all.filter(i => i.deleted_at) })
  }
  const [items, folders] = await Promise.all([getVaultItems(userId, false), getVaultFolders(userId, false)])
  return NextResponse.json({ items, folders })
}
export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { id, iv, ciphertext } = await req.json()
  if (!id || !iv || !ciphertext) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  const row = await createVaultItem(userId, { id, iv, ciphertext })
  return NextResponse.json(row, { status: 201 })
}
