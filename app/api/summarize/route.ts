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

  // Ollama (local) takes priority; falls back to OpenAI
  const ollamaHost = process.env.OLLAMA_HOST
  const openaiKey = process.env.OPENAI_API_KEY
  if (!ollamaHost && !openaiKey) {
    return NextResponse.json({ error: 'No AI backend configured' }, { status: 500 })
  }

  const chatUrl = ollamaHost
    ? `${ollamaHost}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions'

  const model = ollamaHost
    ? (process.env.OLLAMA_MODEL ?? 'llama3')
    : 'gpt-4o-mini'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!ollamaHost && openaiKey) headers['Authorization'] = `Bearer ${openaiKey}`

  try {
    const html = await fetch(url, {
      headers: { 'User-Agent': 'tech-pulse/1.0' },
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text())

    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside, iframe').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

    const messages: { role: string; content: string }[] = []
    if (ollamaHost) {
      messages.push({ role: 'system', content: 'You are a helpful assistant that summarizes articles. Respond only with the summary — no preamble, no commentary.' })
    }
    messages.push({
      role: 'user',
      content: `Summarize this article in 3–5 sentences, focusing on the key insight or finding. Be concrete, not generic.\n\n${text}`,
    })

    // Ollama thinking models need more token budget (reasoning tokens count against max_tokens)
    const maxTokens = ollamaHost ? 4096 : 256

    const res = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(300_000),
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
