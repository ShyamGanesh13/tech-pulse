import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { getSummary, cacheSummary } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { id?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, url } = body
  if (!id || !url) {
    return NextResponse.json({ error: 'id and url are required' }, { status: 400 })
  }

  const cached = await getSummary(id)
  if (cached) return NextResponse.json({ summary: cached })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 500 })

  try {
    const html = await fetch(url, {
      headers: { 'User-Agent': 'tech-pulse/1.0' },
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text())

    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, iframe').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Summarize this article in 3–5 sentences, focusing on the key insight or finding. Be concrete, not generic.\n\n${text}`,
        }],
      }),
    })

    const data = await res.json()
    const summary = data.choices?.[0]?.message?.content ?? ''
    if (!summary) return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })

    await cacheSummary(id, summary)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Summarize error:', err)
    return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })
  }
}
