import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { getSummary, cacheSummary } from '@/lib/data'
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai'

export const dynamic = 'force-dynamic'

async function summarize(text: string): Promise<string> {
  const prompt = `Summarize this article in 3–5 sentences, focusing on the key insight or finding. Be concrete, not generic.\n\n${text}`

  if (platformAIConfigured()) {
    return (await platformAIChat({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes articles. Respond only with the summary — no preamble, no commentary.' },
        { role: 'user', content: prompt },
      ],
    })).trim()
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(300_000),
  })
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

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

  // PlatformAI takes priority; falls back to OpenAI
  if (!platformAIConfigured() && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'No AI backend configured' }, { status: 500 })
  }

  try {
    const html = await fetch(url, {
      headers: { 'User-Agent': 'tech-pulse/1.0' },
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text())

    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, iframe').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

    const summary = await summarize(text)
    if (!summary) return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })

    await cacheSummary(id, summary)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Summarize error:', err)
    return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })
  }
}
