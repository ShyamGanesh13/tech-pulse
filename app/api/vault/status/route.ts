import { NextResponse } from 'next/server'
import { getVaultMeta } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const m = await getVaultMeta(userId)
  if (!m) return NextResponse.json({ initialized: false })
  return NextResponse.json({ initialized: true, kdf_salt: m.kdf_salt, kdf_iterations: m.kdf_iterations, wrapped_dek: m.wrapped_dek })
}
