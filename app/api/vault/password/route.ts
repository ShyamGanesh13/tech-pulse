import { NextResponse } from 'next/server'
import { setVaultMeta } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const { kdf_salt, kdf_iterations, wrapped_dek } = await req.json()
  if (!kdf_salt || !kdf_iterations || !wrapped_dek) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  await setVaultMeta({ kdf_salt, kdf_iterations, wrapped_dek })
  return NextResponse.json({ ok: true })
}
