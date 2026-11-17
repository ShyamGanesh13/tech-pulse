import { addMessage, createConversation, getMessages, getConversation, renameConversation } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { toolInstruction, TOOL_REMINDER, MAX_ROUNDS, parseToolCalls, toolLineGate, runTool, TOOL_STATUS, type Proposal, type ToolResult } from '@/lib/urai-tools'
import { platformAIChatStream, platformAIConfigured } from '@/lib/platform-ai'
import type { UraiSource } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Backend selection ──────────────────────────────────────────────────────
// PlatformAI takes priority; falls back to OpenAI when it's not configured.
const OPENAI_KEY = process.env.OPENAI_API_KEY
const BACKEND = platformAIConfigured() ? 'platformai' : OPENAI_KEY ? 'openai' : null
const OPENAI_MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT =
  'You are Urai, a helpful, concise personal assistant inside a productivity dashboard. ' +
  'Answer in clean Markdown. Money is in Indian rupees (₹), never dollars. ' +
  'When web search results are provided, ground your answer in them and cite naturally.'

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
        let sources: UraiSource[] = []
        let proposals: Proposal[] = []
        let assistantText = ''

        // Decide → run tools → decide again, for up to MAX_ROUNDS tool rounds, so a
        // later step can use an earlier one's results ("find my rent note and make
        // a to-do from it"). Each decision is streamed: if it's an answer it IS the
        // answer (a plain chat costs one AI call; one tool round, two), and the
        // first few characters are held back until it's clear it isn't TOOL lines.
        const convo: Msg[] = [
          { role: 'system', content: SYSTEM_PROMPT + toolInstruction(useWebSearch) },
          ...priorMsgs,
          // Repeated beside the question: in a long chat, earlier "I can't see
          // your data" replies otherwise outweigh the system prompt.
          { role: 'user', content: `${message}\n\n(${TOOL_REMINDER})` },
        ]
        const lastAnswer = [...priorMsgs].reverse().find(m => m.role === 'assistant')?.content ?? ''
        const seen = new Set<string>()
        send({ type: 'status', text: 'Thinking…' })

        // What the user has already seen across rounds: a round's lead-in prose
        // ("You have one high-priority to-do…") stays, and the next round's text
        // continues after it.
        let shown = '', roundStart = true
        const emit = (t: string) => {
          if (roundStart && shown) {
            // A new round's text after an earlier lead-in: one blank line between.
            t = t.replace(/^\s+/, '')
            if (!t) return
            t = '\n\n' + t
          }
          roundStart = false
          send({ type: 'token', value: t })
          shown += t
        }

        for (let round = 0; ; round++) {
          roundStart = true
          const gate = toolLineGate(emit)
          const decision = await streamAnswer(convo, o => gate.push((o as { value: string }).value))
          gate.end()
          const parsed = parseToolCalls(decision)
          const calls = round < MAX_ROUNDS ? parsed : []
          if (!calls.length) {
            // An answer, or TOOL lines past the last round (which fall through to
            // the plain answer below). Either way `shown` is what the user saw.
            assistantText = parsed.length ? '' : shown.trim()
            break
          }

          send({ type: 'status', text: calls.length === 1 ? (TOOL_STATUS[calls[0].name] ?? 'Working…') : `Running ${calls.length} steps…` })
          // Calls within a round are independent by construction, so run together.
          const results = (await Promise.all(calls.map(call =>
            runTool(userId, call.name, call.args, useWebSearch, lastAnswer).catch((err): ToolResult => {
              console.error('[urai] tool failed:', call.name, err)
              return { context: `The ${call.name} lookup failed. Tell the user it could not be checked right now.` }
            }),
          ))).filter((r): r is ToolResult => r != null)
          if (!results.length) break // only unusable calls (unknown tool, web while off)

          sources.push(...results.flatMap(r => r.sources ?? []))
          for (const r of results) {
            // A later round sometimes re-drafts what an earlier one already did.
            const key = r.proposal && JSON.stringify(r.proposal)
            if (key && !seen.has(key)) { seen.add(key); proposals.push(r.proposal!) }
          }
          const more = round + 1 < MAX_ROUNDS
          convo.push(
            { role: 'assistant', content: decision.trim() },
            { role: 'user', content: `Results (from the user's own Thunai apps or the web):\n${results.map(r => r.context).join('\n\n---\n\n')}\n\n${more
              ? 'If the request needs further steps that use these results (for example drafting a to-do or note from what was found), reply with those TOOL lines only — never repeat a step already done. Otherwise answer the original request now, covering every part of it. Be concise; cite naturally if there are sources.'
              : 'Answer the original request now from these results, covering every part of it. No more tools. Be concise; cite naturally if there are sources.'}` },
          )
          send({ type: 'status', text: 'Thinking…' })
        }

        // Nothing usable came back (an unusable TOOL line, or a TOOL line on the
        // last round): answer plainly with whatever data was gathered.
        if (!assistantText) {
          roundStart = true
          const gate = toolLineGate(emit)
          await streamAnswer([...convo, { role: 'user', content: 'Answer the original request now in plain prose. Do not output TOOL lines.' }], o => gate.push((o as { value: string }).value))
          gate.end()
          assistantText = shown.trim()
        }

        const saved = await addMessage(userId, conversationId, 'assistant', assistantText.trim(), sources.length ? sources : null, proposals)

        if (isFirst) {
          const conv = await getConversation(userId, conversationId)
          if (conv && conv.title === 'New chat') {
            await renameConversation(userId, conversationId, deriveTitle(message))
          }
        }

        send({ type: 'done', sources, proposals, messageId: saved.id })
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
