import { NextRequest, NextResponse } from 'next/server'
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai'

export const dynamic = 'force-dynamic'

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const PROMPTS = {
  summarise: (title: string, text: string) => ({
    system: 'You are a concise note summariser. Output only 2-4 bullet points — no preamble, no label, no markdown fences.',
    user: `Summarise this note in 2-4 bullet points:\n\nTitle: ${title}\n\n${text}`,
  }),
  autotitle: (text: string) => ({
    system: 'You are a title generator. Output only the title — no quotes, no preamble, max 8 words.',
    user: `Generate a concise title for this note:\n\n${text}`,
  }),
  improve: (title: string, text: string) => ({
    system: 'You are a writing assistant. Improve the text: fix grammar, improve clarity, keep the same meaning. Return only the improved text as plain paragraphs separated by newlines. No HTML, no markdown fences.',
    user: `Improve this note:\n\nTitle: ${title}\n\n${text}`,
  }),
  generate: (prompt: string) => ({
    system: 'You are a note-writing assistant. Write well-structured, detailed content based on the user\'s prompt. Use plain text with clear sections and bullet points where appropriate. No HTML, no markdown fences. Separate paragraphs and sections with blank lines.',
    user: prompt,
  }),
}

export async function POST(req: NextRequest) {
  if (!platformAIConfigured()) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const body = await req.json()
  const { action, content, title = '' } = body

  if (!action || !content) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const plainText = stripHtml(content)

  // generate uses the content field as the user prompt directly
  if (action === 'generate') {
    if (!plainText.trim()) return NextResponse.json({ error: 'Empty prompt' }, { status: 400 })
  } else {
    if (!plainText.trim()) return NextResponse.json({ error: 'Empty note' }, { status: 400 })
  }

  const promptFn = PROMPTS[action as keyof typeof PROMPTS]
  if (!promptFn) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const prompt = action === 'autotitle' ? PROMPTS.autotitle(plainText)
    : action === 'generate' ? PROMPTS.generate(plainText)
    : (promptFn as (t: string, c: string) => { system: string; user: string })(title, plainText)

  try {
    const result = (await platformAIChat({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    })).trim()

    if (!result) return NextResponse.json({ error: 'Empty response' }, { status: 502 })

    return NextResponse.json({ result })
  } catch (err) {
    console.error('[notes/ai]', err)
    return NextResponse.json({ error: 'AI unavailable' }, { status: 503 })
  }
}
