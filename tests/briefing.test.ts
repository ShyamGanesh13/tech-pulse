import { describe, it, expect } from 'bun:test'
import {
  briefingStories, briefingTitle, feedIsStale, splitTodos, overdueDrafts, briefingPush, fallbackBriefing, isEmpty, addDays,
  type BriefingData,
} from '@/lib/briefing'
import { GET } from '@/app/api/briefing/route'
import type { Todo, Nyabagam } from '@/lib/types'

const a = (id: string, source: string, title: string, topics = ['AI'], relevance = 1) =>
  ({ id, source: source as never, title, url: `https://example.com/${id}`, topics, relevance, score: 0 })

const todo = (id: string, title: string, due_date: string | null, done = 0): Todo =>
  ({ user_id: 'u', id, title, description: null, priority: 'medium', done, due_date, completed_at: null, created_at: '' })

describe('briefingStories', () => {
  it('ranks like the Top today strip: most-covered first, untagged and digest sources out', () => {
    const out = briefingStories([
      a('1', 'arxiv', 'A paper about models', ['AI'], 9),
      a('2', 'hn', 'Acme ships Widget 9000 quantum chip'),
      a('3', 'techcrunch', 'Acme ships Widget 9000 quantum chip today'),
      a('4', 'hn', 'Off-topic gardening post', []),
      a('5', 'tldrai', 'Digest: five unrelated things', ['AI'], 20),
    ])
    expect(out.map(s => s.title)).toEqual(['Acme ships Widget 9000 quantum chip', 'A paper about models'])
  })

  it('caps at three', () => {
    const many = Array.from({ length: 8 }, (_, i) => a(`n${i}`, 'hn', `Unrelated subject number${i} alpha${i} beta${i}`))
    expect(briefingStories(many)).toHaveLength(3)
  })
})

describe('feedIsStale', () => {
  const now = new Date('2026-11-18T08:00:00Z')
  it('is stale when the newest article is over six hours old, or there are none', () => {
    expect(feedIsStale([], now)).toBe(true)
    expect(feedIsStale([{ fetched_at: '2026-11-18T01:30:00Z' }], now)).toBe(true)
    expect(feedIsStale([{ fetched_at: '2026-11-17T09:00:00Z' }, { fetched_at: '2026-11-18T03:00:00Z' }], now)).toBe(false)
  })
})

describe('briefing content', () => {
  const day = '2026-11-18' // a Wednesday
  it('titles by date (the once-a-day key) and handles month ends', () => {
    expect(briefingTitle(day)).toBe('Morning briefing · Wed 18 Nov')
    expect(addDays('2026-12-01', -1)).toBe('2026-11-30')
  })

  it('splits open to-dos into today and overdue, and drafts moves for the overdue', () => {
    const { dueToday, overdue } = splitTodos([
      todo('a', 'Today thing', day), todo('b', 'Late', '2026-11-15'), todo('c', 'Later', '2026-11-12'),
      todo('d', 'Done late', '2026-11-10', 1), todo('e', 'Someday', null), todo('f', 'Future', '2026-11-20'),
    ], day)
    expect(dueToday.map(t => t.id)).toEqual(['a'])
    expect(overdue.map(t => t.id)).toEqual(['c', 'b']) // oldest first
    expect(overdueDrafts(overdue, day)).toEqual([
      { kind: 'todo_update', id: 'c', title: 'Later', change: 'due Thu 2026-11-12 → today', patch: { due_date: day } },
      { kind: 'todo_update', id: 'b', title: 'Late', change: 'due Sun 2026-11-15 → today', patch: { due_date: day } },
    ])
  })

  const data: BriefingData = {
    day, dueToday: [todo('a', 'Ship it', day)], overdue: [todo('b', 'Late', '2026-11-15')],
    reminders: [{ user_id: 'u', id: 'r', title: 'Dentist', description: null, remind_at: `${day}T10:00:00`, created_at: '' } as Nyabagam],
    money: { yesterday: 1240, monthToDate: 18500, budget: 30000 },
    stories: [{ title: 'Big news', url: 'https://example.com/n' }],
  }

  it('pushes one line of counts that opens the chat', () => {
    expect(briefingPush(data, '/urai?c=x')).toEqual({
      title: 'Good morning ☀️',
      body: '2 on today · 1 overdue · ₹1,240 spent yesterday · 1 top story',
      tag: 'briefing-2026-11-18',
      url: '/urai?c=x',
    })
  })

  it('has a complete fallback when no AI answers', () => {
    const text = fallbackBriefing(data)
    for (const s of ['10:00 Dentist', 'Ship it', '**Overdue:** Late', '₹1,240 yesterday', '₹18,500 this month of ₹30,000', '[Big news](https://example.com/n)']) {
      expect(text).toContain(s)
    }
  })

  it('treats a day with nothing in it as empty, so no push goes out', () => {
    expect(isEmpty({ day, dueToday: [], overdue: [], reminders: [], money: null, stories: [] })).toBe(true)
    expect(isEmpty(data)).toBe(false)
  })
})

describe('GET /api/briefing auth', () => {
  const call = (headers: Record<string, string> = {}) =>
    GET(new Request('http://localhost/api/briefing', { headers }) as never)

  async function withSecret(value: string | undefined, fn: () => Promise<void>) {
    const prev = process.env.CRON_SECRET
    if (value === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = value
    try { await fn() } finally {
      if (prev === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prev
    }
  }

  it('refuses to run with no CRON_SECRET configured', () =>
    withSecret(undefined, async () => { expect((await call()).status).toBe(503) }))

  it('rejects a missing or wrong bearer token', () =>
    withSecret('test-secret', async () => {
      expect((await call()).status).toBe(401)
      expect((await call({ authorization: 'Bearer nope' })).status).toBe(401)
      expect((await call({ authorization: 'test-secret' })).status).toBe(401)
    }))
})
