// Urai's tools over the user's own data. PlatformAI has no function-calling (see
// app/api/urai/route.ts), so a tool call is a plain-text line the model emits:
//   TOOL: <name> {"json":"args"}
// Up to MAX_TOOLS per round, one per line, for up to MAX_ROUNDS rounds; each
// round's results go back to the model, which may call more tools that use them.
// Every tool runs with the caller's userId, so tenants stay separated by the same
// facade every route uses. Aran is deliberately absent: it is zero-knowledge.

import {
  getTransactionSummary, getTransactions, getAgendaTodos, getNyabagamByDate,
  getUpcomingNyabagam, getNotes,
} from '@/lib/data'
import { searchArticles } from '@/lib/article-search'
import { webSearch } from '@/lib/websearch'
import type { UraiSource, UraiProposal } from '@/lib/types'

const TZ = 'Asia/Kolkata'

export function nowIST() {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const weekday = d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })
  return { date, time, weekday }
}

export type Proposal = UraiProposal

export interface ToolResult {
  context: string
  sources?: UraiSource[]
  proposal?: Proposal
}

/** The next two weeks spelled out: the model miscounts weekdays ("this Friday"
 *  landed on a Saturday) when left to do date arithmetic itself. */
function calendarAhead(today: string, days = 14): string {
  const out: string[] = []
  const d = new Date(`${today}T12:00:00Z`)
  for (let i = 0; i < days; i++) {
    out.push(`${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${d.toISOString().slice(0, 10)}`)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out.join(', ')
}

export function toolInstruction(webSearchOn: boolean): string {
  const { date, time, weekday } = nowIST()
  return `

Today is ${weekday}, ${date}, and the time is ${time} (India time). The next 14 days: ${calendarAhead(date)}. You can look at the user's own data in this app. If answering needs it, reply with one line per tool you need (at most ${MAX_TOOLS}, for example a lookup plus a draft, or two drafts) and nothing else:
TOOL: <name> <json args>
Tools:
- spending {"month":"YYYY-MM","category":"optional, e.g. Food & Dining"} — income, expenses, category totals and the largest transactions for a month (Selvam).
- due {"days":7} — open to-dos and reminders from today through the next N days (Ninaivu).
- notes {"query":"words"} — search the user's notes (Kuripu).
- feed {"query":"words"} — search the user's tech news feed (Thagaval).
- create_reminder {"title":"…","remind_at":"Fri 2026-11-20 09:00"} — draft a timed reminder (weekday, date, 24-hour time).
- add_todo {"title":"…","priority":"low|medium|high","due_date":"Fri 2026-11-20"} — draft a to-do (due today if no date is given).
- save_note {"title":"…","content":"optional"} — draft a note. Leave content out to save your previous answer in this chat; pass content (Markdown, \n for line breaks) to save something else, such as what a search found.
Call tools together only when they don't depend on each other. If a step needs another step's result (save what a search finds, remind about what's due), call just the first now: you will see its results and can then call the next.
The three drafting tools only draft; a Confirm button under your reply saves each one and shows whether it is saved.${webSearchOn ? `
- web {"query":"…"} — search the web for current, real-time information.` : ''}
You cannot see the user's data any other way, so a question about their money, to-dos, reminders, notes or news feed MUST use the matching tool, every time, even if an earlier message in this chat already looked: never answer it from memory or guess that nothing exists. Money is in Indian rupees (₹).
Resolve relative dates ("tomorrow", "the 5th", "this Friday") by reading them off that list, never by counting. A bare or "this" weekday ("Thursday", "this Friday") is its FIRST occurrence in the list, today included; only "next <weekday>" means the one a week after that. If no tool is needed, answer the question directly.`
}

export const MAX_TOOLS = 3
/** Tool rounds per message; a later round sees the earlier rounds' results. */
export const MAX_ROUNDS = 3

export const TOOL_REMINDER =
  'If this is about my money, to-dos, reminders, notes or news feed, reply with the TOOL line(s), not an answer.'

export interface ToolCall { name: string; args: Record<string, unknown> }

/** Every line that starts with TOOL: -> a call (at most MAX_TOOLS). The model
 *  sometimes writes a sentence before its TOOL lines; that prose is a lead-in
 *  (the route streams it and keeps the TOOL lines back), not the answer. */
export function parseToolCalls(text: string | null): ToolCall[] {
  const calls: ToolCall[] = []
  for (const line of (text ?? '').split('\n')) {
    const m = line.trim().match(/^TOOL:\s*([a-z_]+)\s*(\{.*\})?$/i)
    if (!m) continue
    let args: Record<string, unknown> = {}
    try { if (m[2]) args = JSON.parse(m[2]) } catch { /* named tool, unusable args */ }
    calls.push({ name: m[1].toLowerCase(), args })
  }
  return calls.slice(0, MAX_TOOLS)
}

/** Streams a decision to the client while holding back TOOL lines: complete
 *  lines go out as they arrive unless they are TOOL lines, a partial line waits
 *  only while it could still become "TOOL:", and once a TOOL line appears the
 *  rest of the decision is withheld. `sent` is what the user has seen. */
export function toolLineGate(emit: (text: string) => void) {
  let pending = '', sawTool = false, sent = ''
  const out = (t: string) => { if (t) { emit(t); sent += t } }
  const isTool = (line: string) => /^\s*TOOL:/i.test(line)
  return {
    push(piece: string) {
      if (sawTool) return
      pending += piece
      let nl: number
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl + 1)
        pending = pending.slice(nl + 1)
        if (isTool(line)) { sawTool = true; pending = ''; return }
        out(line)
      }
      const head = pending.trimStart().slice(0, 5).toUpperCase()
      if (head && !'TOOL:'.startsWith(head)) { out(pending); pending = '' }
    },
    end() { if (!sawTool && !isTool(pending)) out(pending); pending = '' },
    get sent() { return sent },
  }
}

export const TOOL_STATUS: Record<string, string> = {
  spending: 'Checking your spending…',
  due: 'Checking what’s due…',
  notes: 'Searching your notes…',
  feed: 'Searching your feed…',
  create_reminder: 'Drafting a reminder…',
  add_todo: 'Drafting a to-do…',
  save_note: 'Drafting a note…',
  web: 'Searching the web…',
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** "Fri 2026-11-20" (or a bare date) -> "2026-11-20". The model writes both, and
 *  when they disagree its weekday is right far more often than its arithmetic
 *  ("this Friday" from a Tuesday came back as Saturday's date), so the date moves
 *  to the nearest day with that weekday. */
export function resolveDay(raw: string): string | null {
  const m = raw.trim().match(/^(?:([a-z]{3})[a-z]*,?\s+)?(\d{4}-\d{2}-\d{2})/i)
  if (!m) return null
  const d = new Date(`${m[2]}T12:00:00Z`)
  if (isNaN(d.getTime())) return null
  const want = m[1] ? WEEKDAYS.indexOf(m[1].toLowerCase()) : -1
  if (want >= 0) {
    let diff = (want - d.getUTCDay() + 7) % 7
    if (diff > 3) diff -= 7
    d.setUTCDate(d.getUTCDate() + diff)
  }
  return d.toISOString().slice(0, 10)
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
// The reply outlives the moment: a chat reloaded after Confirm still shows it,
// so it must not narrate save state ("not saved yet") — the chip owns that.
const DRAFT_NOTE =
  'Describe it in one short line, e.g. "Drafted: …". Do NOT say whether it is saved and do NOT tell the user to tap or confirm anything: the button under your reply shows that and stays accurate after a reload.'

const esc = (t: string) =>
  t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Urai's Markdown subset (bold, links, bullets, headings, paragraphs) as Kuripu
 *  HTML. Everything is escaped first: an answer can quote web or feed text, and
 *  Kuripu renders with innerHTML. Only http(s) links become hrefs, and the URL is
 *  already escaped, so it can't break out of the attribute. */
export function markdownToNoteHtml(md: string): string {
  const inline = (t: string) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
  const out: string[] = []
  let items: string[] = []
  const flush = () => { if (items.length) out.push(`<ul>${items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); items = [] }
  for (const line of md.split('\n')) {
    const bullet = line.match(/^\s*[*-]\s+(.*)/)
    if (bullet) { items.push(bullet[1]); continue }
    flush()
    const h = line.match(/^#{1,6}\s+(.*)/)
    if (h) out.push(`<h3>${inline(h[1])}</h3>`)
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  flush()
  return out.join('')
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export async function runTool(
  userId: string, name: string, args: Record<string, unknown>, webSearchOn: boolean,
  lastAnswer = '',
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
      const day = resolveDay(str(args.remind_at))
      const hm = str(args.remind_at).match(/(\d{1,2}):(\d{2})\s*$/)
      const at = day && hm ? `${day}T${hm[1].padStart(2, '0')}:${hm[2]}` : ''
      if (!title || !at) {
        return { context: 'The reminder needs a title and a date and time. Ask the user for whatever is missing.' }
      }
      const { date, time } = nowIST()
      if (at < `${date}T${time}`) {
        return { context: `${at.replace('T', ' ')} is in the past. Ask the user for a future time.` }
      }
      return {
        context: `Drafted a Ninaivu reminder "${title}" for ${at.replace('T', ' ')}. ${DRAFT_NOTE}`,
        proposal: { kind: 'reminder', title, remind_at: `${at}:00` },
      }
    }

    case 'add_todo': {
      const title = str(args.title).slice(0, 200)
      if (!title) return { context: 'The to-do needs a title. Ask the user what it should say.' }
      const priority = (['low', 'medium', 'high'] as const).find(p => p === str(args.priority)) ?? 'medium'
      const due_date = resolveDay(str(args.due_date)) ?? nowIST().date
      return {
        context: `Drafted a Ninaivu to-do "${title}" (${priority} priority, due ${due_date}). ${DRAFT_NOTE}`,
        proposal: { kind: 'todo', title, priority, due_date },
      }
    }

    case 'save_note': {
      const body = (str(args.content) || lastAnswer).slice(0, 8000)
      if (!body.trim()) return { context: 'There is nothing to save yet. Ask the user what the note should contain.' }
      const title = str(args.title).slice(0, 120) || body.replace(/[#*\n]+/g, ' ').trim().slice(0, 60)
      return {
        context: `Drafted a Kuripu note (their notes app) titled "${title}". ${DRAFT_NOTE} Do not repeat the note's content.`,
        proposal: { kind: 'note', title, content: markdownToNoteHtml(body) },
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
