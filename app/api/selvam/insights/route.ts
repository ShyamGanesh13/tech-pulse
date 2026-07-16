import { NextRequest, NextResponse } from 'next/server'
import { getTransactionSummary, getMonthlyTotals } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Module-level cache: month string -> { insight, expiresAt }
const insightCache = new Map<string, { insight: string; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function monthLabel(month: string): string {
  // month is "YYYY-MM"
  const [year, mon] = month.split('-')
  const date = new Date(Number(year), Number(mon) - 1, 1)
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ insight: null })
  }

  // Check module-level cache
  const cached = insightCache.get(month)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ insight: cached.insight, month })
  }

  const ollamaHost = process.env.OLLAMA_HOST
  if (!ollamaHost) {
    return NextResponse.json({ insight: null })
  }

  try {
    // Fetch summary for the requested month
    const summary = await getTransactionSummary(month)
    const { credit, debit, count, by_category } = summary

    // Fetch last 4 months to get comparison with previous month
    const monthlyTotals = await getMonthlyTotals(4)

    // Find previous month entry (monthlyTotals is ordered ascending, current month last)
    const prevMonthEntry = monthlyTotals.length >= 2
      ? monthlyTotals[monthlyTotals.length - 2]
      : null

    // Build top spending categories string
    const topCategories = (by_category as { category: string; amount: number }[])
      .slice(0, 3)
      .map(c => {
        const pct = debit > 0 ? Math.round((c.amount / debit) * 100) : 0
        return `${c.category} ${fmt(c.amount)} (${pct}%)`
      })
      .join(', ')

    // Build comparison line
    let comparisonLine = ''
    if (prevMonthEntry) {
      const expenseChange = prevMonthEntry.debit > 0
        ? Math.round(((debit - prevMonthEntry.debit) / prevMonthEntry.debit) * 100)
        : 0
      const incomeChange = prevMonthEntry.credit > 0
        ? Math.round(((credit - prevMonthEntry.credit) / prevMonthEntry.credit) * 100)
        : 0
      const expSign = expenseChange >= 0 ? '+' : ''
      const incSign = incomeChange >= 0 ? '+' : ''
      comparisonLine = `vs last month: expenses ${fmt(prevMonthEntry.debit)} (${expSign}${expenseChange}%), income ${fmt(prevMonthEntry.credit)} (${incSign}${incomeChange}%)`
    }

    const net = credit - debit
    const contextLines = [
      `Month: ${monthLabel(month)}`,
      `Income: ${fmt(credit)} | Expenses: ${fmt(debit)} | Net: ${fmt(net)} | Transactions: ${count}`,
      topCategories ? `Top spending: ${topCategories}` : null,
      comparisonLine || null,
    ].filter(Boolean).join('\n')

    const model = process.env.OLLAMA_CLASSIFY_MODEL ?? 'qwen3:8b'
    const chatUrl = `${ollamaHost}/api/chat`

    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: [
          {
            role: 'system',
            content: 'You are a personal finance assistant. Based on this data, write 2-3 sentences of actionable spending insight. Be specific with numbers. No preamble.',
          },
          {
            role: 'user',
            content: contextLines,
          },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      console.error('Ollama insights error:', res.status, await res.text())
      return NextResponse.json({ insight: null })
    }

    const data = await res.json()
    const insight: string = data?.message?.content ?? ''
    if (!insight) {
      return NextResponse.json({ insight: null })
    }

    // Store in module-level cache
    insightCache.set(month, { insight, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ insight, month })
  } catch (err) {
    console.error('Finance insights error:', err)
    return NextResponse.json({ insight: null })
  }
}
