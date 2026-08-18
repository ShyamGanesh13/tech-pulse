import { NextRequest, NextResponse } from 'next/server'
import { getImportSources, deleteTransactionsBySource } from '@/lib/db'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const sources = await getImportSources(userId)
  return NextResponse.json({ sources })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const source = req.nextUrl.searchParams.get('source')
  if (!source) return NextResponse.json({ error: 'source is required' }, { status: 400 })
  const deleted = await deleteTransactionsBySource(userId, source)
  return NextResponse.json({ deleted })
}
