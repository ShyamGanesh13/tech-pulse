import { NextResponse } from 'next/server'
import { getVaultMeta } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET() {
  const m = await getVaultMeta()
  if (!m) return NextResponse.json({ initialized: false })
  return NextResponse.json({ initialized: true, kdf_salt: m.kdf_salt, kdf_iterations: m.kdf_iterations, wrapped_dek: m.wrapped_dek })
}
