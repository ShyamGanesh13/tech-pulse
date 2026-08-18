import { NextResponse } from 'next/server'
import { setVaultMeta } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { kdf_salt, kdf_iterations, wrapped_dek } = await req.json()
  if (!kdf_salt || !kdf_iterations || !wrapped_dek) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  await setVaultMeta(userId, { kdf_salt, kdf_iterations, wrapped_dek })
  return NextResponse.json({ ok: true })
}
