// Urai's tools over the user's own data. PlatformAI has no function-calling (see
// app/api/urai/route.ts), so a tool call is a plain-text line the model emits:
//   TOOL: <name> {"json":"args"}
// One tool per turn; its result goes back to the model as context for the answer.
// Every tool runs with the caller's userId, so tenants stay separated by the same
// facade every route uses. Aran is deliberately absent: it is zero-knowledge.

import {
  getTransactionSummary, getTransactions, getAgendaTodos, getNyabagamByDate,
  getUpcomingNyabagam, getNotes,
} from '@/lib/data'
import { searchArticles } from '@/lib/article-search'
import { webSearch } from '@/lib/websearch'
import type { UraiSource } from '@/lib/types'

const TZ = 'Asia/Kolkata'

export function nowIST() {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const weekday = d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })
  return { date, time, weekday }
}

export interface ReminderProposal {
  kind: 'reminder'
  title: string
  remind_at: string // YYYY-MM-DDTHH:MM:00, local (IST) — the format Ninaivu's form writes
}

export interface ToolResult {
  context: string
  sources?: UraiSource[]
  proposal?: ReminderProposal
}

export function toolInstruction(webSearchOn: boolean): string {
  const { date, time, weekday } = nowIST()
  return `

Today is ${weekday}, ${date}, and the time is ${time} (India time). You can look at the user's own data in this app. If answering needs it, reply with EXACTLY one line and nothing else:
TOOL: <name> <json args>
Tools:
- spending {"month":"YYYY-MM","category":"optional, e.g. Food & Dining"} — income, expenses, category totals and the largest transactions for a month (Selvam).
- due {"days":7} — open to-dos and reminders from today through the next N days (Ninaivu).
- notes {"query":"words"} — search the user's notes (Kuripu).
- feed {"query":"words"} — search the user's tech news feed (Thagaval).
- create_reminder {"title":"…","remind_at":"YYYY-MM-DDTHH:MM"} — draft a reminder; the user confirms it with a button, so never claim it is already saved.${webSearchOn ? `
- web {"query":"…"} — search the web for current, real-time information.` : ''}
You cannot see the user's data any other way, so a question about their money, to-dos, reminders, notes or news feed MUST use the matching tool, every time, even if an earlier message in this chat already looked: never answer it from memory or guess that nothing exists. Money is in Indian rupees (₹).
Resolve relative dates ("tomorrow", "the 5th", "next Friday") against today. If no tool is needed, answer the question directly.`
}

export const TOOL_REMINDER =
  'If this is about my money, to-dos, reminders, notes or news feed, reply with the TOOL line, not an answer.'

export function parseToolCall(text: string | null): { name: string; args: Record<string, unknown> } | null {
  const m = text?.trim().match(/^TOOL:\s*([a-z_]+)\s*(\{[\s\S]*\})?\s*$/i)
  if (!m) return null
  try {
    return { name: m[1].toLowerCase(), args: m[2] ? JSON.parse(m[2]) : {} }
  } catch {
    return { name: m[1].toLowerCase(), args: {} }
  }
}

export const TOOL_STATUS: Record<string, string> = {
  spending: 'Checking your spending…',
  due: 'Checking what’s due…',
  notes: 'Searching your notes…',
  feed: 'Searching your feed…',
  create_reminder: 'Drafting a reminder…',
  web: 'Searching the web…',
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export async function runTool(
  userId: string, name: string, args: Record<string, unknown>, webSearchOn: boolean,
): Promise<ToolResult | null> {
  switch (name) {
    case 'spending': {
      const month = /^\d{4}-\d{2}$/.test(str(args.month)) ? str(args.month) : nowIST().date.slice(0, 7)
      const category = str(args.category)
      const [summary, txns] = await Promise.all([
        getTransactionSummary(userId, month),
        getTransactions(userId, { month, ...(category ? { category } : {}) }),
      ])
      if (!summary.count) return { context: `No transactions recorded for ${month}.` }
      const cats = summary.by_category.map(c => `${c.category}: ${inr(c.amount)}`).join('; ')
      const top = txns.filter(t => t.type === 'debit').sort((a, b) => b.amount - a.amount).slice(0, 10)
        .map(t => `${t.date} ${t.description} ${inr(t.amount)} (${t.category})`).join('\n')
      return {
        context: `Selvam, ${month}: income ${inr(summary.credit)}, expenses ${inr(summary.debit)}, ${summary.count} transactions.
Expenses by category: ${cats || 'none'}.
Largest debits${category ? ` in ${category}` : ''}:
${top || 'none'}`,
      }
    }

    case 'due': {
      const days = Math.min(Math.max(Number(args.days) || 7, 1), 31)
      const today = nowIST().date
      const [todos, todayRem, upcoming] = await Promise.all([
        getAgendaTodos(userId, today),
        getNyabagamByDate(userId, today),
        getUpcomingNyabagam(userId, today, days),
      ])
      const open = todos.filter(t => t.done === 0).slice(0, 25)
        .map(t => `- ${t.title} [${t.priority}]${t.due_date ? ` due ${t.due_date}` : ''}`).join('\n')
      const rems = [...todayRem, ...upcoming]
        .map(r => `- ${r.title} at ${r.remind_at.replace('T', ' ').slice(0, 16)}`).join('\n')
      return { context: `Ninaivu, today ${today} through the next ${days} days.
Open to-dos:
${open || 'none'}
Reminders:
${rems || 'none'}` }
    }

    case 'notes': {
      const terms = str(args.query).toLowerCase().split(/\s+/).filter(Boolean)
      const notes = (await getNotes(userId)).map(n => ({ ...n, text: stripHtml(n.content) }))
      const scored = notes
        .map(n => {
          const hay = `${n.title} ${n.text}`.toLowerCase()
          return { n, score: terms.length ? terms.filter(t => hay.includes(t)).length : 1 }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      if (!scored.length) return { context: `No notes match "${str(args.query)}".` }
      return { context: 'Kuripu notes:\n' + scored
        .map(({ n }) => `## ${n.title || 'Untitled'} (updated ${n.updated_at.slice(0, 10)})\n${n.text.slice(0, 600)}`)
        .join('\n\n') }
    }

    case 'feed': {
      const q = str(args.query)
      if (!q) return { context: 'No feed query given.' }
      const { articles } = await searchArticles(userId, q)
      const top = articles.slice(0, 8)
      if (!top.length) return { context: `Nothing in the user's feed matches "${q}".` }
      return {
        context: 'Thagaval feed matches:\n' + top
          .map((a, i) => `[${i + 1}] ${a.title} (${a.source})\n${a.url}${a.summary ? `\n${a.summary.slice(0, 300)}` : ''}`)
          .join('\n\n'),
        sources: top.map(a => ({ title: a.title, url: a.url })),
      }
    }

    case 'create_reminder': {
      const title = str(args.title).slice(0, 200)
      const at = str(args.remind_at).slice(0, 16)
      if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) {
        return { context: 'The reminder needs a title and a date and time. Ask the user for whatever is missing.' }
      }
      const { date, time } = nowIST()
      if (at < `${date}T${time}`) {
        return { context: `${at.replace('T', ' ')} is in the past. Ask the user for a future time.` }
      }
      return {
        context: `Drafted reminder "${title}" for ${at.replace('T', ' ')}. It is NOT saved yet: tell the user to tap Confirm below to add it to Ninaivu.`,
        proposal: { kind: 'reminder', title, remind_at: `${at}:00` },
      }
    }

    case 'web': {
      if (!webSearchOn) return null
      const q = str(args.query)
      const results = await webSearch(q)
      return {
        context: results.length
          ? 'Web search results:\n' + results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
          : 'No web results found.',
        sources: results.map(r => ({ title: r.title, url: r.url })),
      }
    }
  }
  return null
}
