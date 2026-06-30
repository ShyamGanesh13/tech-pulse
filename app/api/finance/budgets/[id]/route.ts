import { NextResponse } from 'next/server'
import { deleteBudget } from '@/lib/db'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteBudget(Number(id))
  return new NextResponse(null, { status: 204 })
}
