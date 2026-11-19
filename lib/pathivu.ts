// Pathivu's pure logic: date ranges and the two prompts. No I/O, no Next —
// everything here is unit-testable, which is the whole reason the routes are
// thin wrappers around it.
import type { Pathivu } from './types'

/** YYYY-MM-DD in IST (en-CA formats as ISO). Kept local rather than imported from
 *  briefing.ts: that pulls in the data facade, which imports this file. */
export function istDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Monday of the week `date` falls in. The work week reads Mon→Sun here. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const dow = d.getUTCDay()           // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

/** Both the Catalyst text column's cap and the most raw_transcript keeps. */
export const TRANSCRIPT_MAX = 10000
const TRIMMED = '[earlier dictation trimmed]\n\n'

/**
 * A day's dictation record after one more dictation. Appends, so a second
 * dictation never erases what the first one heard — but when the record
 * outgrows the column it drops its OLDEST text (marked), instead of making the
 * save fail. raw_transcript is the backup; it must never block saving the entry.
 */
export function appendTranscript(prior: string, next: string | null, max = TRANSCRIPT_MAX): string {
  const joined = next ? `${prior}\n\n${next}`.trim() : prior
  if (joined.length <= max) return joined
  const keep = joined.slice(joined.length - (max - TRIMMED.length))
  return TRIMMED + keep.replace(/^\S*\s/, '') // start at a word boundary
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export type ReportRange = 'week' | 'month'

/**
 * The window a report covers: start of the week or month, through today.
 *
 * Deliberately not the *previous* week — the button is for "how is this week
 * going", and a Friday report of a week still in progress is the common case.
 */
export function reportRange(range: ReportRange, today: string = istDate()): { from: string; to: string } {
  return { from: range === 'week' ? weekStart(today) : monthStart(today), to: today }
}

function withWeekday(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${date}`
}

/**
 * Turning a 5-minute dictation into the day's entry.
 *
 * The hard rule is no invention: speech-to-text already garbles technical words,
 * and a model that "improves" a garbled sentence by guessing turns a transcription
 * error into a false record. Rephrasing is allowed; adding facts is not.
 */
export function polishMessages(rawText: string, existing?: string | null) {
  const system = `You clean up a software engineer's spoken work journal into the day's written entry.

Rules:
- Keep every fact, name, number and technical term exactly as spoken. Never add detail that was not said, never guess at a half-heard word — leave an unclear phrase as it is rather than inventing a plausible one.
- Write in first person, past tense, the way the speaker talks. Do not add enthusiasm, reflection or advice of your own.
- Remove filler ("um", "like", "you know"), false starts and repetition. Fix grammar and sentence boundaries.
- Group the content under only the headings that actually apply, in this order: "What I did", "Still pending", "Blocked on", "Focus next", "Learned". Use markdown "## " headings and "- " bullets. Omit any heading with nothing under it.
- Output the entry only. No preamble, no closing remark, no meta-commentary.`

  const user = existing && existing.trim()
    ? `Here is the entry already saved for this day:\n\n${existing}\n\n---\n\nHere is what was just dictated to add to it. Merge the two into one entry, keeping everything from both, without repeating a point that is already there:\n\n${rawText}`
    : `Here is the dictation:\n\n${rawText}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * A month of entries can outgrow the model's window. Oldest days are dropped
 * first and the report says so, rather than silently reporting on part of the
 * range as though it were the whole.
 */
export const REPORT_MAX_CHARS = 60_000

export function packEntries(entries: Pathivu[]): { text: string; used: number; dropped: number } {
  const parts: string[] = []
  let total = 0
  let used = 0
  // Newest first while filling, so the days that get dropped are the oldest.
  for (const e of [...entries].reverse()) {
    const block = `### ${withWeekday(e.entry_date)}\n${e.content.trim()}`
    if (total + block.length > REPORT_MAX_CHARS && used > 0) break
    parts.unshift(block)
    total += block.length
    used++
  }
  return { text: parts.join('\n\n'), used, dropped: entries.length - used }
}

export function reportMessages(range: ReportRange, from: string, to: string, entries: Pathivu[]) {
  const { text, used, dropped } = packEntries(entries)
  const label = range === 'week' ? 'week' : 'month'

  const system = `You read a software engineer's daily work journal and report back on a ${label}.

Ground every statement in the entries. If something is not in them, it is not in the report — no filler, no generic advice, no motivational tone. Quote the engineer's own words for anything specific.

Write markdown under exactly these headings, omitting any that the entries give you nothing for:

## Shipped
What was finished, with the date it landed.

## Still open
Work mentioned and not reported finished. For each, say when it first appeared and when it was last mentioned — "first mentioned Mon 2026-11-10, still open Fri 2026-11-14". Flag anything that has been open across three or more days.

## Learned
New things learned or understood, kept as concrete as the entry was.

## Pattern
Two or three sentences at most: where the ${label} actually went, and what keeps recurring. Say it plainly, including if it is unflattering.

Be concise. A short report that is entirely true beats a long one that fills gaps with guesses.`

  const note = dropped > 0
    ? `\n\n(Note: the ${dropped} oldest ${dropped === 1 ? 'entry was' : 'entries were'} left out to fit; report on what follows and say so in one line at the end.)`
    : ''

  const user = `Journal entries from ${withWeekday(from)} to ${withWeekday(to)} — ${used} ${used === 1 ? 'day' : 'days'} with an entry.${note}\n\n${text}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
