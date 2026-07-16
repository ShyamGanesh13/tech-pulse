export const dynamic = 'force-dynamic'

import { getNyabagamByDate, getTodos } from '@/lib/db'
import type { Nyabagam, Todo } from '@/lib/types'

interface BriefingCache {
  briefing: string
  date: string
}

let cache: BriefingCache | null = null

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET() {
  const today = getTodayStr()

  if (cache && cache.date === today) {
    return Response.json(cache)
  }

  const ollamaHost = process.env.OLLAMA_HOST
  if (!ollamaHost) {
    return Response.json({ briefing: null })
  }

  try {
    const [nyabagam, todos] = await Promise.all([
      getNyabagamByDate(today) as Promise<Nyabagam[]>,
      getTodos() as Promise<Todo[]>,
    ])

    const pendingTodos = todos.filter((t: Todo) => t.done === 0)

    const nyabagamLines = nyabagam.length === 0
      ? 'No nyabagam today.'
      : `Nyabagam today: ${nyabagam.map((r: Nyabagam) => r.title).join(', ')}`

    const todoLines = pendingTodos.length === 0
      ? 'No pending todos.'
      : `Pending todos: ${pendingTodos.slice(0, 5).map((t: Todo) => t.title).join(', ')}${pendingTodos.length > 5 ? ` and ${pendingTodos.length - 5} more` : ''}`

    const context = [nyabagamLines, todoLines].join('\n')

    const model = process.env.OLLAMA_CLASSIFY_MODEL ?? 'qwen3:8b'

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let ollamaRes: Response
    try {
      ollamaRes = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          messages: [
            {
              role: 'system',
              content:
                'You are a personal assistant writing a brief daily summary. Mention the actual nyabagam and todo titles specifically — do not just give counts. Keep it to 2 short sentences, warm and natural. No date, no preamble, no sign-off.',
            },
            {
              role: 'user',
              content: context,
            },
          ],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!ollamaRes.ok) {
      return Response.json({ briefing: null })
    }

    const ollamaData = await ollamaRes.json()
    const briefingText: string =
      ollamaData?.message?.content ?? ollamaData?.choices?.[0]?.message?.content ?? ''

    if (!briefingText) {
      return Response.json({ briefing: null })
    }

    cache = { briefing: briefingText, date: today }
    return Response.json(cache)
  } catch {
    return Response.json({ briefing: null })
  }
}
