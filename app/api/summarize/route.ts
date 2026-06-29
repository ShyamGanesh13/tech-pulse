import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { getSummary, cacheSummary } from '@/lib/db'

export const dynamic = 'force-dynamic'

const client = new Anthropic()

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

  const cached = getSummary(id)
  if (cached) return NextResponse.json({ summary: cached })

  try {
    const html = await fetch(url, {
      headers: { 'User-Agent': 'tech-pulse/1.0' },
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text())

    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, iframe').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Summarize this article in 3–5 sentences, focusing on the key insight or finding. Be concrete, not generic.\n\n${text}`,
      }],
    })

    const summary = (message.content[0] as { type: string; text: string }).text
    cacheSummary(id, summary)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Summarize error:', err)
    return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })
  }
}
