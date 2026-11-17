import { addMessage, createConversation, getMessages, getConversation, renameConversation } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { toolInstruction, parseToolCall, runTool, TOOL_STATUS, type ReminderProposal, type ToolResult } from '@/lib/urai-tools'
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
// comes back with a null result, not a tool-call decision) — so tool use is a
// plain-text convention instead; see lib/urai-tools.ts.

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
        let proposal: ReminderProposal | undefined
        let assistantText = ''

        // One decision call per message: either a direct answer (sent as-is, so a
        // plain chat still costs one AI call) or a single TOOL line.
        send({ type: 'status', text: 'Thinking…' })
        const decision = await chatOnce([
          { role: 'system', content: SYSTEM_PROMPT + toolInstruction(useWebSearch) },
          ...priorMsgs,
          { role: 'user', content: message },
        ])
        const call = parseToolCall(decision)
        let result: ToolResult | null = null
        if (call) {
          send({ type: 'status', text: TOOL_STATUS[call.name] ?? 'Working…' })
          result = await runTool(userId, call.name, call.args, useWebSearch).catch(err => {
            console.error('[urai] tool failed:', call.name, err)
            return { context: `The ${call.name} lookup failed. Tell the user it could not be checked right now.` }
          })
        }

        if (result) {
          sources = result.sources ?? []
          proposal = result.proposal
          assistantText = await streamAnswer([
            ...msgs,
            { role: 'user', content: `Data for the question above (from the user's own Thunai apps or the web):\n${result.context}\n\nNow answer the original question from this data. Be concise; cite naturally if there are sources.` },
          ], send)
        } else {
          // No tool: the decision is the answer. An unusable TOOL line (unknown
          // tool, web while search is off) falls back to a normal answer.
          assistantText = call ? '' : (decision ?? '').trim()
          if (assistantText) send({ type: 'token', value: assistantText })
          else assistantText = await streamAnswer(msgs, send)
        }

        await addMessage(userId, conversationId, 'assistant', assistantText.trim(), sources.length ? sources : null)

        if (isFirst) {
          const conv = await getConversation(userId, conversationId)
          if (conv && conv.title === 'New chat') {
            await renameConversation(userId, conversationId, deriveTitle(message))
          }
        }

        send({ type: 'done', sources, proposal })
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
