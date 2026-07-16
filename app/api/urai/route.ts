import { addMessage, createConversation, getMessages, getConversation, renameConversation } from '@/lib/db'
import { webSearch } from '@/lib/websearch'
import type { UraiSource } from '@/lib/types'

export const dynamic = 'force-dynamic'

const OLLAMA_HOST = process.env.OLLAMA_HOST
const MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'gemma4'

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

interface OllamaMessage {
  role: string
  content: string
  tool_calls?: { function: { name: string; arguments: unknown } }[]
}

function deriveTitle(msg: string): string {
  const clean = msg.replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean || 'New chat'
}

async function ollamaChat(
  messages: OllamaMessage[],
  opts: { stream: boolean; tools?: unknown[]; signal?: AbortSignal },
): Promise<Response> {
  return fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: opts.stream,
      think: false,
      ...(opts.tools ? { tools: opts.tools } : {}),
      messages,
    }),
    signal: opts.signal,
  })
}

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
        // Ensure a conversation exists
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

        if (!OLLAMA_HOST) {
          const notice = 'AI is not connected — set OLLAMA_HOST to use Urai.'
          send({ type: 'token', value: notice })
          await addMessage(conversationId, 'user', message)
          await addMessage(conversationId, 'assistant', notice)
          send({ type: 'done', sources: [] })
          return
        }

        // Build model context from history + the new user message
        const prior = await getMessages(conversationId)
        await addMessage(conversationId, 'user', message)
        const msgs: OllamaMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...prior.slice(-20).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ]

        let sources: UraiSource[] = []
        let assistantText = ''

        if (useWebSearch) {
          send({ type: 'status', text: 'Thinking…' })
          const decisionRes = await ollamaChat(msgs, { stream: false, tools: [WEB_SEARCH_TOOL] })
          const decision = decisionRes.ok ? await decisionRes.json() : null
          const toolCall = decision?.message?.tool_calls?.[0]

          if (toolCall?.function?.name === 'web_search') {
            const rawArgs = toolCall.function.arguments
            const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs
            const query: string = args?.query ?? message
            send({ type: 'status', text: `Searching the web for “${query}”…` })
            const results = await webSearch(query)
            sources = results.map(r => ({ title: r.title, url: r.url }))

            msgs.push(decision.message as OllamaMessage)
            msgs.push({
              role: 'tool',
              content: results.length
                ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
                : 'No results found.',
            })
            assistantText = await streamAnswer(msgs, send)
          } else {
            // Model chose not to search; it may have answered directly.
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
      } catch {
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

/** Streams a final text answer from Ollama (no tools) and returns the full text. */
async function streamAnswer(
  msgs: OllamaMessage[],
  send: (obj: unknown) => void,
): Promise<string> {
  const res = await ollamaChat(msgs, { stream: true })
  if (!res.ok || !res.body) return ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line)
        const piece: string = chunk?.message?.content ?? ''
        if (piece) {
          full += piece
          send({ type: 'token', value: piece })
        }
      } catch {
        /* ignore partial/non-JSON lines */
      }
    }
  }
  return full
}
