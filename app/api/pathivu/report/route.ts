import { NextRequest, NextResponse } from 'next/server'
import { getPathivuRange } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { reportRange, reportMessages, type ReportRange } from '@/lib/pathivu'
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai'

export const dynamic = 'force-dynamic'
// A month of entries is a large prompt.
export const maxDuration = 60

/** Findings over the current week (Mon→today) or month (1st→today), from the
 *  range's raw entries. Nothing is precomputed; each click asks the model. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const range = req.nextUrl.searchParams.get('range')
  if (range !== 'week' && range !== 'month') {
    return NextResponse.json({ error: 'range must be week or month' }, { status: 400 })
  }
  const { from, to } = reportRange(range as ReportRange)
  const entries = (await getPathivuRange(userId, from, to)).filter(e => e.content.trim())
  if (!entries.length) return NextResponse.json({ findings: null, from, to, entries: 0 })

  if (!platformAIConfigured()) {
    return NextResponse.json({ error: 'Reports need the AI backend, which is not configured here.', from, to, entries: entries.length }, { status: 503 })
  }
  try {
    const findings = (await platformAIChat({ messages: reportMessages(range as ReportRange, from, to, entries) })).trim()
    return NextResponse.json({ findings, from, to, entries: entries.length })
  } catch (err) {
    console.error('[pathivu] report failed:', err)
    return NextResponse.json({ error: 'The report could not be generated — try again.', from, to, entries: entries.length }, { status: 502 })
  }
}
