import { NextResponse } from 'next/server'
import { runFetch } from '../../../scripts/fetch'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await runFetch()
    return NextResponse.json({ ok: true, total: result.total, failed: result.failed })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
