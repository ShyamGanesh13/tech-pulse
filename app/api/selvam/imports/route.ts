import { NextRequest, NextResponse } from 'next/server'
import { getImportSources, deleteTransactionsBySource } from '@/lib/db'

export async function GET() {
  const sources = await getImportSources()
  return NextResponse.json({ sources })
}

export async function DELETE(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source')
  if (!source) return NextResponse.json({ error: 'source is required' }, { status: 400 })
  const deleted = await deleteTransactionsBySource(source)
  return NextResponse.json({ deleted })
}
