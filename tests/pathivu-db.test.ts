// Pathivu against the throwaway SQLite file (TP_CATALYST_DOMAINS is unset in
// tests, so '@/lib/data' routes the journal domain to lib/db.ts).
import { describe, it, expect } from 'bun:test'
import { getPathivu, getPathivuRange, getPathivuDates, savePathivu } from '@/lib/data'

// Unique per run: the test DB persists across runs and one-entry-per-day is unique.
const run = Date.now().toString(36)
const A = `test-user-pathivu-a-${run}`
const B = `test-user-pathivu-b-${run}`

describe('pathivu storage', () => {
  it('creates a day and reads it back; a blank day is null', async () => {
    const e = await savePathivu(A, '2019-03-04', '## What I did\n- first', 'um first')
    expect(e).toMatchObject({ user_id: A, entry_date: '2019-03-04', content: '## What I did\n- first', raw_transcript: 'um first' })
    expect(await getPathivu(A, '2019-03-04')).toMatchObject({ id: e.id, content: '## What I did\n- first' })
    expect(await getPathivu(A, '2019-03-05')).toBeNull()
  })

  it('upsert replaces content, appends raw_transcript, and keeps it on null', async () => {
    const first = await getPathivu(A, '2019-03-04')
    await savePathivu(A, '2019-03-04', 'edited', 'um second')
    let e = await getPathivu(A, '2019-03-04')
    expect(e!.id).toBe(first!.id)               // edited in place, not a second row
    expect(e!.content).toBe('edited')
    expect(e!.raw_transcript).toBe('um first\n\num second')

    await savePathivu(A, '2019-03-04', 'typed only', null)
    e = await getPathivu(A, '2019-03-04')
    expect(e!.content).toBe('typed only')
    expect(e!.raw_transcript).toBe('um first\n\num second')
  })

  it('range is inclusive at both ends and ordered by date', async () => {
    for (const d of ['2019-03-10', '2019-03-08', '2019-03-12', '2019-04-01']) await savePathivu(A, d, `day ${d}`, null)
    const r = await getPathivuRange(A, '2019-03-08', '2019-03-12')
    expect(r.map(e => e.entry_date)).toEqual(['2019-03-08', '2019-03-10', '2019-03-12'])
  })

  it('getPathivuDates lists that month only', async () => {
    expect((await getPathivuDates(A, 2019, 3)).sort((x, y) => x - y)).toEqual([4, 8, 10, 12])
    expect(await getPathivuDates(A, 2019, 4)).toEqual([1])
  })
})

describe('pathivu tenancy', () => {
  it("another user sees none of A's entries", async () => {
    expect(await getPathivu(B, '2019-03-04')).toBeNull()
    expect(await getPathivuRange(B, '2019-01-01', '2019-12-31')).toEqual([])
    expect(await getPathivuDates(B, 2019, 3)).toEqual([])
  })

  it("B writing the same day makes B's own row and leaves A's untouched", async () => {
    const before = await getPathivu(A, '2019-03-04')
    const b = await savePathivu(B, '2019-03-04', 'B private', 'b words')
    expect(b.id).not.toBe(before!.id)
    expect(await getPathivu(A, '2019-03-04')).toEqual(before)
    expect((await getPathivu(B, '2019-03-04'))!.content).toBe('B private')
  })
})
