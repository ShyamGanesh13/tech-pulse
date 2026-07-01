export const dynamic = 'force-dynamic'

import { getRemindersByDate, getTodos, getNotes } from '@/lib/db'
import type { Reminder, Todo, Note } from '@/lib/types'

interface BriefingCache {
  briefing: string
  date: string
}

let cache: BriefingCache | null = null

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentMonthStr(): string {
  return new Date().toISOString().slice(0, 7)
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
    const [reminders, todos, notes] = await Promise.all([
      getRemindersByDate(today) as Promise<Reminder[]>,
      getTodos() as Promise<Todo[]>,
      getNotes() as Promise<Note[]>,
    ])

    const pendingTodos = todos.filter((t: Todo) => t.done === 0)

    const reminderTitles = reminders
      .slice(0, 3)
      .map((r: Reminder) => r.title)
      .join(', ')

    const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const dateFormatted = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const context = [
      `Today: ${weekday}, ${dateFormatted}`,
      `Reminders today: ${reminders.length}${reminders.length > 0 ? ` (${reminderTitles})` : ''}`,
      `Pending todos: ${pendingTodos.length}`,
      `Notes: ${notes.length}`,
    ].join('\n')

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
                'You are a personal assistant. Write a warm, concise 2-sentence daily briefing based on this data. Be specific about numbers. No preamble, no sign-off.',
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
