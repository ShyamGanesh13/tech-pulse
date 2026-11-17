import { groupStories } from './story-groups'
import { topStories } from './top-stories'
import { DIGEST_SOURCES } from './source-registry'
import { day as withWeekday } from './urai-tools'
import type { Article, Todo, Nyabagam, UraiProposal, UraiSource } from './types'

/**
 * Urai's morning briefing: one chat a day per opted-in user, plus a push that
 * opens it. Everything here is pure; GET /api/briefing gathers the data and
 * writes the chat.
 *
 * It replaced the Thagaval digest push, and keeps its ranking: the stories are
 * exactly the in-app "Top today" strip's, so the briefing and the page cannot
 * disagree.
 */

export const BRIEFING_STORIES = 3
/** Overdue to-dos get a "move to today" draft each, up to this many. */
export const MAX_OVERDUE_DRAFTS = 3

/** YYYY-MM-DD in IST — the briefing's notion of "today" (en-CA formats as ISO). */
export function istDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Also the once-a-day guard: the route skips a user who already has a chat
 *  with today's title, which survives restarts and repeat cron fires. */
export function briefingTitle(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `Morning briefing · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
}

/** A refresh is worth its ~10s only when the stored feed is older than this. */
export const FEED_STALE_HOURS = 6

/** Stale when the newest stored article (fetched_at is the refresh time, not the
 *  publish time) is older than FEED_STALE_HOURS, or there is none. */
export function feedIsStale(articles: Pick<Article, 'fetched_at'>[], now: Date = new Date()): boolean {
  const newest = articles.reduce((m, a) => (a.fetched_at > m ? a.fetched_at : m), '')
  return !newest || now.getTime() - new Date(newest).getTime() > FEED_STALE_HOURS * 3_600_000
}

export function briefingStories(
  articles: Pick<Article, 'id' | 'source' | 'title' | 'url' | 'topics' | 'relevance' | 'score'>[],
): UraiSource[] {
  return topStories(groupStories(articles, DIGEST_SOURCES), BRIEFING_STORIES, DIGEST_SOURCES)
    .map(s => ({ title: s.title.trim(), url: s.url }))
}

export interface BriefingData {
  day: string
  dueToday: Todo[]
  overdue: Todo[]
  reminders: Nyabagam[]
  /** null when the user has no Selvam data this month. */
  money: { yesterday: number; monthToDate: number; budget: number | null } | null
  stories: UraiSource[]
}

/** Split open to-dos into due today and overdue. */
export function splitTodos(todos: Todo[], today: string): { dueToday: Todo[]; overdue: Todo[] } {
  const open = todos.filter(t => t.done === 0 && t.due_date)
  return {
    dueToday: open.filter(t => t.due_date === today),
    overdue: open.filter(t => t.due_date! < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
  }
}

/** Deterministic drafts — no AI involved in deciding what to propose. */
export function overdueDrafts(overdue: Todo[], today: string): UraiProposal[] {
  return overdue.slice(0, MAX_OVERDUE_DRAFTS).map(t => ({
    kind: 'todo_update', id: t.id, title: t.title,
    change: `due ${withWeekday(t.due_date!)} → today`,
    patch: { due_date: today },
  }))
}

export function isEmpty(d: BriefingData): boolean {
  return !d.dueToday.length && !d.overdue.length && !d.reminders.length && !d.money && !d.stories.length
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const hhmm = (r: Nyabagam) => r.remind_at.slice(11, 16)

/** The facts handed to the model, and the shape the fallback text follows. */
export function briefingFacts(d: BriefingData): string {
  const lines = [`Today is ${withWeekday(d.day)}.`]
  lines.push(d.reminders.length
    ? `Reminders today: ${d.reminders.map(r => `${r.title} at ${hhmm(r)}`).join('; ')}.`
    : 'No reminders today.')
  lines.push(d.dueToday.length
    ? `To-dos due today: ${d.dueToday.map(t => `${t.title} [${t.priority}]`).join('; ')}.`
    : 'No to-dos due today.')
  if (d.overdue.length) {
    lines.push(`Overdue to-dos: ${d.overdue.map(t => `${t.title} (was due ${withWeekday(t.due_date!)})`).join('; ')}. ` +
      `"Move to today" buttons are attached for the first ${Math.min(d.overdue.length, MAX_OVERDUE_DRAFTS)}.`)
  }
  if (d.money) {
    lines.push(`Spent yesterday: ${inr(d.money.yesterday)}. This month so far: ${inr(d.money.monthToDate)}` +
      (d.money.budget ? ` of a ${inr(d.money.budget)} budget.` : '.'))
  }
  if (d.stories.length) lines.push(`Top stories: ${d.stories.map(s => `[${s.title}](${s.url})`).join('; ')}.`)
  return lines.join('\n')
}

/** Used when no AI backend answers: plain, but complete. */
export function fallbackBriefing(d: BriefingData): string {
  const out = [`**Good morning — ${withWeekday(d.day)}**`, '']
  if (d.reminders.length) out.push(...d.reminders.map(r => `- ⏰ ${hhmm(r)} ${r.title}`))
  if (d.dueToday.length) out.push(...d.dueToday.map(t => `- ☑️ ${t.title}${t.priority === 'high' ? ' **(high)**' : ''}`))
  if (!d.reminders.length && !d.dueToday.length) out.push('Nothing scheduled today.')
  if (d.overdue.length) out.push('', `**Overdue:** ${d.overdue.map(t => t.title).join(', ')}`)
  if (d.money) {
    out.push('', `**Money:** ${inr(d.money.yesterday)} yesterday · ${inr(d.money.monthToDate)} this month` +
      (d.money.budget ? ` of ${inr(d.money.budget)}` : ''))
  }
  if (d.stories.length) out.push('', '**Top stories**', ...d.stories.map(s => `- [${s.title}](${s.url})`))
  return out.join('\n')
}

export interface BriefingPush {
  title: string
  body: string
  tag: string
  url: string
}

/** One short line of counts; the chat holds the detail. */
export function briefingPush(d: BriefingData, url: string): BriefingPush {
  const parts: string[] = []
  const today = d.reminders.length + d.dueToday.length
  parts.push(today ? `${today} on today` : 'Nothing scheduled today')
  if (d.overdue.length) parts.push(`${d.overdue.length} overdue`)
  if (d.money) parts.push(`${inr(d.money.yesterday)} spent yesterday`)
  if (d.stories.length) parts.push(`${d.stories.length} top ${d.stories.length === 1 ? 'story' : 'stories'}`)
  return {
    title: 'Good morning ☀️',
    body: parts.join(' · '),
    // One tag per day: a repeat send replaces the first instead of stacking.
    tag: `briefing-${d.day}`,
    url,
  }
}
