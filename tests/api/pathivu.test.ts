import { describe, it, expect, mock } from 'bun:test'

// Same stub as tests/api/aran.test.ts: handlers read cookies() via lib/auth,
// which has no request scope when called directly.
// Unique per run: the test DB persists and raw_transcript appends across saves.
const TEST_UID = `test-user-pathivu-api-${Date.now().toString(36)}`
mock.module('@/lib/auth', () => ({
  getUserIdOrNull: async () => TEST_UID,
  unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  SESSION_COOKIE: 'tp_session',
}))

const { GET, PUT } = await import('@/app/api/pathivu/route')
const { POST: transcribe } = await import('@/app/api/pathivu/transcribe/route')
const { POST: polish } = await import('@/app/api/pathivu/polish/route')
const { GET: report } = await import('@/app/api/pathivu/report/route')
const { NextRequest } = await import('next/server')

const req = (url: string, init?: RequestInit) => new NextRequest(`http://localhost${url}`, init as never)
const put = (body: unknown) => PUT(req('/api/pathivu', { method: 'PUT', body: JSON.stringify(body) }))

describe('PUT /api/pathivu validation', () => {
  it('rejects a non-ISO date, a future date, and missing content', async () => {
    expect((await put({ entry_date: '2026-1-1', content: 'x' })).status).toBe(400)
    expect((await put({ entry_date: '2099-01-01', content: 'x' })).status).toBe(400)
    expect((await put({ entry_date: '2020-01-01' })).status).toBe(400)
    expect((await PUT(req('/api/pathivu', { method: 'PUT', body: 'not json' }))).status).toBe(400)
  })

  it('saves a past day and reads it back, by day and by month', async () => {
    const res = await put({ entry_date: '2020-02-03', content: '## What I did\n- tests', raw_transcript: 'um tests' })
    expect(res.status).toBe(200)
    expect((await res.json()).entry.content).toBe('## What I did\n- tests')

    const day = await (await GET(req('/api/pathivu?date=2020-02-03'))).json()
    expect(day.entry.raw_transcript).toBe('um tests')
    expect((await (await GET(req('/api/pathivu?month=2020-02'))).json()).days).toEqual([3])
    expect((await GET(req('/api/pathivu?date=bad'))).status).toBe(400)
    expect((await GET(req('/api/pathivu?month=2020-2'))).status).toBe(400)
  })
})

describe('the AI-backed routes validate before calling out', () => {
  it('transcribe needs an audio part', async () => {
    const prev = process.env.PATHIVU_STT_KEY
    process.env.PATHIVU_STT_KEY = 'test-key-never-sent'
    try {
      const res = await transcribe(req('/api/pathivu/transcribe', { method: 'POST', body: new FormData() }))
      expect(res.status).toBe(400)
    } finally {
      if (prev === undefined) delete process.env.PATHIVU_STT_KEY
      else process.env.PATHIVU_STT_KEY = prev
    }
  })

  it('polish needs text', async () => {
    expect((await polish(req('/api/pathivu/polish', { method: 'POST', body: JSON.stringify({ text: '  ' }) }))).status).toBe(400)
    expect((await polish(req('/api/pathivu/polish', { method: 'POST', body: '{' }))).status).toBe(400)
  })

  it('report checks the range, and an empty range skips the model', async () => {
    expect((await report(req('/api/pathivu/report?range=year'))).status).toBe(400)
    // This user only has a 2020 entry, so the current week is empty by construction.
    const body = await (await report(req('/api/pathivu/report?range=week'))).json()
    expect(body).toMatchObject({ findings: null, entries: 0 })
    expect(body.from <= body.to).toBe(true)
  })
})
