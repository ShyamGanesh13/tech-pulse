import { addMessage, createConversation, getMessages, getConversation, renameConversation } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { webSearch } from '@/lib/websearch'
import { platformAIChat, platformAIChatStream, platformAIConfigured } from '@/lib/platform-ai'
import type { UraiSource } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Backend selection ──────────────────────────────────────────────────────
// PlatformAI takes priority; falls back to OpenAI when it's not configured.
const OPENAI_KEY = process.env.OPENAI_API_KEY
const BACKEND = platformAIConfigured() ? 'platformai' : OPENAI_KEY ? 'openai' : null
const OPENAI_MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT =
  'You are Urai, a helpful, concise personal assistant inside a productivity dashboard. ' +
  'Answer in clean Markdown. When web search results are provided, ground your answer in them and cite naturally.'

// PlatformAI's chat endpoint has no OpenAI-style function-calling (a `tools` schema
// comes back with a null result, not a tool-call decision) — so the search decision
// is a plain-text convention instead, checked with SEARCH_MARKER below.
const SEARCH_DECISION_INSTRUCTION =
  '\n\nIf answering well requires current, real-time information you do not reliably know ' +
  '(recent news, prices, live facts, anything time-sensitive), respond with EXACTLY one line: ' +
  '"SEARCH: <query>" and nothing else — no punctuation, no explanation. Otherwise answer the question directly.'
const SEARCH_MARKER = /^SEARCH:\s*(.+)$/i

interface Msg {
  role: string
  content: string
}

function deriveTitle(msg: string): string {
  const clean = msg.replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean || 'New chat'
}

// ── Non-streaming chat (search decision / direct answer) ──────────────────

async function chatOnce(messages: Msg[]): Promise<string | null> {
  try {
    if (BACKEND === 'platformai') return await platformAIChat({ messages })

    if (BACKEND === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: OPENAI_MODEL, stream: false, messages }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.choices?.[0]?.message?.content ?? null
    }
  } catch {
    return null
  }
  return null
}

// ── Streaming chat ─────────────────────────────────────────────────────────

async function streamAnswer(messages: Msg[], send: (o: unknown) => void): Promise<string> {
  if (BACKEND === 'platformai') {
    try {
      return await platformAIChatStream({ messages }, piece => send({ type: 'token', value: piece }))
    } catch {
      return ''
    }
  }

  if (BACKEND === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: OPENAI_MODEL, stream: true, messages }),
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
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const body = await req.json()
  const message: string = (body.message ?? '').toString()
  const useWebSearch: boolean = !!body.webSearch
  let conversationId: string | undefined = body.conversationId

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        let isFirst = false
        if (!conversationId) {
          const conv = await createConversation(userId)
          conversationId = conv.id
          isFirst = true
        } else {
          const prior = await getMessages(userId, conversationId)
          isFirst = prior.length === 0
        }
        send({ type: 'meta', conversationId })

        if (!BACKEND) {
          const notice = '⚠ No AI backend configured. Add PlatformAI credentials (or OPENAI_API_KEY) to your environment variables.'
          send({ type: 'token', value: notice })
          await addMessage(userId, conversationId, 'user', message)
          await addMessage(userId, conversationId, 'assistant', notice)
          send({ type: 'done', sources: [] })
          return
        }

        const prior = await getMessages(userId, conversationId)
        await addMessage(userId, conversationId, 'user', message)
        const priorMsgs = prior.slice(-20).map(m => ({ role: m.role, content: m.content }))
        const msgs: Msg[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...priorMsgs,
          { role: 'user', content: message },
        ]

        let sources: UraiSource[] = []
        let assistantText = ''

        if (useWebSearch) {
          send({ type: 'status', text: 'Thinking…' })
          const decisionMsgs: Msg[] = [
            { role: 'system', content: SYSTEM_PROMPT + SEARCH_DECISION_INSTRUCTION },
            ...priorMsgs,
            { role: 'user', content: message },
          ]
          const decision = await chatOnce(decisionMsgs)
          const match = decision?.trim().match(SEARCH_MARKER)

          if (match) {
            const query = match[1].trim()
            send({ type: 'status', text: `Searching the web for "${query}"…` })
            const results = await webSearch(query)
            sources = results.map(r => ({ title: r.title, url: r.url }))

            const resultsText = results.length
              ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
              : 'No results found.'
            const followUp: Msg[] = [
              ...msgs,
              { role: 'user', content: `Search results:\n${resultsText}\n\nNow answer the original question using these results, citing naturally.` },
            ]
            assistantText = await streamAnswer(followUp, send)
          } else {
            assistantText = (decision ?? '').trim()
            if (assistantText) send({ type: 'token', value: assistantText })
            else assistantText = await streamAnswer(msgs, send)
          }
        } else {
          assistantText = await streamAnswer(msgs, send)
        }

        await addMessage(userId, conversationId, 'assistant', assistantText.trim(), sources.length ? sources : null)

        if (isFirst) {
          const conv = await getConversation(userId, conversationId)
          if (conv && conv.title === 'New chat') {
            await renameConversation(userId, conversationId, deriveTitle(message))
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
