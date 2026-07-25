import { NextRequest, NextResponse } from 'next/server'
import { createVaultFolder } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const { id, parent_id, iv, name_ct, sort_order } = await req.json()
  if (!id || !iv || !name_ct) return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  const row = await createVaultFolder({ id, parent_id: parent_id ?? null, iv, name_ct, sort_order: sort_order ?? 0 })
  return NextResponse.json(row, { status: 201 })
}
