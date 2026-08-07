import { addMessage, createConversation, getMessages, getConversation, renameConversation } from '@/lib/db'
import { webSearch } from '@/lib/websearch'
import type { UraiSource } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Backend selection ──────────────────────────────────────────────────────
// Ollama (local) takes priority; falls back to OpenAI when OLLAMA_HOST is absent.
const OLLAMA_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '')
const OPENAI_KEY  = process.env.OPENAI_API_KEY
const BACKEND = OLLAMA_HOST ? 'ollama' : OPENAI_KEY ? 'openai' : null

const MODEL = OLLAMA_HOST
  ? (process.env.OLLAMA_CHAT_MODEL ?? 'gemma4')
  : 'gpt-4o-mini'

const SYSTEM_PROMPT =
  'You are Urai, a helpful, concise personal assistant inside a productivity dashboard. ' +
  'Answer in clean Markdown. When web search results are provided, ground your answer in them and cite naturally.'

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for current, real-time information. Use when the user asks about recent events, news, prices, or facts you may not reliably know.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query' } },
      required: ['query'],
    },
  },
}

interface Msg {
  role: string
  content: string
  tool_calls?: { function: { name: string; arguments: unknown } }[]
}

function deriveTitle(msg: string): string {
  const clean = msg.replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean || 'New chat'
}

// ── Non-streaming chat (tool-call decision) ────────────────────────────────

async function chatOnce(messages: Msg[], tools?: unknown[]): Promise<{ message: Msg } | null> {
  if (BACKEND === 'ollama') {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, think: false, messages, ...(tools ? { tools } : {}) }),
    })
    if (!res.ok) return null
    return res.json()
  }

  if (BACKEND === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: MODEL, stream: false, messages, ...(tools ? { tools, tool_choice: 'auto' } : {}) }),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Normalise OpenAI shape → Ollama shape so the rest of the code is uniform.
    const choice = data.choices?.[0]?.message
    return choice ? { message: choice } : null
  }

  return null
}

// ── Streaming chat ─────────────────────────────────────────────────────────

async function streamAnswer(messages: Msg[], send: (o: unknown) => void): Promise<string> {
  if (BACKEND === 'ollama') {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: true, think: false, messages }),
    })
    if (!res.ok || !res.body) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line)
          const piece: string = chunk?.message?.content ?? ''
          if (piece) { full += piece; send({ type: 'token', value: piece }) }
        } catch { /* partial line */ }
      }
    }
    return full
  }

  if (BACKEND === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: MODEL, stream: true, messages }),
    })
    if (!res.ok || !res.body) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
        try {
          const chunk = JSON.parse(jsonStr)
          const piece: string = chunk?.choices?.[0]?.delta?.content ?? ''
          if (piece) { full += piece; send({ type: 'token', value: piece }) }
        } catch { /* partial SSE line */ }
      }
    }
    return full
  }

  return ''
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json()
  const message: string = (body.message ?? '').toString()
  const useWebSearch: boolean = !!body.webSearch
  let conversationId: number | undefined = body.conversationId

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        let isFirst = false
        if (!conversationId) {
          const conv = await createConversation()
          conversationId = conv.id
          isFirst = true
        } else {
          const prior = await getMessages(conversationId)
          isFirst = prior.length === 0
        }
        send({ type: 'meta', conversationId })

        if (!BACKEND) {
          const notice = '⚠ No AI backend configured. Add OPENAI_API_KEY (or OLLAMA_HOST) to your environment variables.'
          send({ type: 'token', value: notice })
          await addMessage(conversationId, 'user', message)
          await addMessage(conversationId, 'assistant', notice)
          send({ type: 'done', sources: [] })
          return
        }

        const prior = await getMessages(conversationId)
        await addMessage(conversationId, 'user', message)
        const msgs: Msg[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...prior.slice(-20).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ]

        let sources: UraiSource[] = []
        let assistantText = ''

        if (useWebSearch) {
          send({ type: 'status', text: 'Thinking…' })
          const decision = await chatOnce(msgs, [WEB_SEARCH_TOOL])
          const toolCall = decision?.message?.tool_calls?.[0]

          if (toolCall?.function?.name === 'web_search') {
            const rawArgs = toolCall.function.arguments
            const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs
            const query: string = args?.query ?? message
            send({ type: 'status', text: `Searching the web for "${query}"…` })
            const results = await webSearch(query)
            sources = results.map(r => ({ title: r.title, url: r.url }))

            msgs.push(decision!.message as Msg)
            msgs.push({
              role: 'tool',
              content: results.length
                ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
                : 'No results found.',
            })
            assistantText = await streamAnswer(msgs, send)
          } else {
            assistantText = decision?.message?.content ?? ''
            if (assistantText) send({ type: 'token', value: assistantText })
            else assistantText = await streamAnswer(msgs, send)
          }
        } else {
          assistantText = await streamAnswer(msgs, send)
        }

        await addMessage(conversationId, 'assistant', assistantText.trim(), sources.length ? sources : null)

        if (isFirst) {
          const conv = await getConversation(conversationId)
          if (conv && conv.title === 'New chat') {
            await renameConversation(conversationId, deriveTitle(message))
          }
        }

        send({ type: 'done', sources })
      } catch (err) {
        console.error('[urai] error:', err)
        send({ type: 'token', value: '\n\n⚠ Something went wrong. Please try again.' })
        send({ type: 'done', sources: [] })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
