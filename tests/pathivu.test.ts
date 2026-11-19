import { test, expect } from 'bun:test'
import {
  weekStart, monthStart, reportRange, packEntries, polishMessages, reportMessages,
  appendTranscript, REPORT_MAX_CHARS,
} from '@/lib/pathivu'
import type { Pathivu } from '@/lib/types'

const entry = (entry_date: string, content: string): Pathivu =>
  ({ user_id: 'u', id: entry_date, entry_date, raw_transcript: '', content, created_at: '', updated_at: '' })

test('weekStart is the Monday, across Sunday and Monday boundaries', () => {
  expect(weekStart('2026-11-22')).toBe('2026-11-16') // Sunday belongs to the week before
  expect(weekStart('2026-11-23')).toBe('2026-11-23') // Monday is its own start
  expect(weekStart('2026-11-19')).toBe('2026-11-16')
  expect(weekStart('2026-12-02')).toBe('2026-11-30') // crosses a month
})

test('monthStart and reportRange', () => {
  expect(monthStart('2026-11-19')).toBe('2026-11-01')
  expect(reportRange('week', '2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-19' })
  expect(reportRange('month', '2026-11-19')).toEqual({ from: '2026-11-01', to: '2026-11-19' })
})

test('packEntries drops the OLDEST entries first and says how many', () => {
  const big = 'x'.repeat(Math.ceil(REPORT_MAX_CHARS / 3))
  const entries = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(d => entry(d, big))
  const { text, used, dropped } = packEntries(entries)
  expect(dropped).toBe(entries.length - used)
  expect(dropped).toBeGreaterThan(0)
  expect(text).toContain('2026-11-04')
  expect(text).not.toContain('2026-11-01')
  expect(text.length).toBeLessThanOrEqual(REPORT_MAX_CHARS + 100)

  const small = packEntries([entry('2026-11-01', 'a'), entry('2026-11-02', 'b')])
  expect(small).toMatchObject({ used: 2, dropped: 0 })
  expect(small.text.indexOf('2026-11-01')).toBeLessThan(small.text.indexOf('2026-11-02')) // chronological
})

test('polishMessages: plain dictation vs merge into the saved entry', () => {
  const plain = polishMessages('um I fixed the ZCQL bug')
  expect(plain).toHaveLength(2)
  expect(plain[0].role).toBe('system')
  expect(plain[0].content).toMatch(/Never add detail/)
  for (const h of ['What I did', 'Still pending', 'Blocked on', 'Focus next', 'Learned']) expect(plain[0].content).toContain(h)
  expect(plain[1].content).toContain('I fixed the ZCQL bug')
  expect(plain[1].content).not.toContain('already saved')

  const merged = polishMessages('also deployed', '## What I did\n- fixed bug')
  expect(merged[1].content).toContain('already saved')
  expect(merged[1].content).toContain('- fixed bug')
  expect(merged[1].content).toContain('also deployed')
  // A blank saved entry is treated as no entry.
  expect(polishMessages('x', '   ')[1].content).not.toContain('already saved')
})

test('reportMessages carries the dated range, the headings, and the dropped note', () => {
  const m = reportMessages('week', '2026-11-16', '2026-11-19', [entry('2026-11-17', 'shipped login')])
  for (const h of ['## Shipped', '## Still open', '## Learned', '## Pattern']) expect(m[0].content).toContain(h)
  expect(m[1].content).toContain('Mon 2026-11-16')
  expect(m[1].content).toContain('Thu 2026-11-19')
  expect(m[1].content).toContain('1 day with an entry')
  expect(m[1].content).not.toContain('left out')

  const big = 'y'.repeat(Math.ceil(REPORT_MAX_CHARS / 2) + 10)
  const over = reportMessages('month', '2026-11-01', '2026-11-19', ['2026-11-01', '2026-11-02', '2026-11-03'].map(d => entry(d, big)))
  expect(over[1].content).toMatch(/oldest .* left out/)
})

test('appendTranscript appends, keeps prior on null, and trims the OLDEST on overflow', () => {
  expect(appendTranscript('first', 'second')).toBe('first\n\nsecond')
  expect(appendTranscript('', 'only')).toBe('only')
  expect(appendTranscript('kept', null)).toBe('kept')

  const out = appendTranscript('old words here '.repeat(10), 'the newest dictation', 100)
  expect(out.length).toBeLessThanOrEqual(100)
  expect(out.startsWith('[earlier dictation trimmed]')).toBe(true)
  expect(out.endsWith('the newest dictation')).toBe(true)
})
