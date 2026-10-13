import { describe, expect, it } from 'bun:test'
import { BULK_MAX_ROWS, chunk } from '../lib/catalyst'

describe('chunk / BULK_MAX_ROWS', () => {
  // The Datastore row API takes at most 200 rows per insertRows and rejects a
  // longer call whole, so the cap must stay under that with room to spare.
  it('stays under the row API ceiling', () => {
    expect(BULK_MAX_ROWS).toBeLessThanOrEqual(200)
  })

  it('splits a 356-row statement into parts the row API will accept', () => {
    const rows = Array.from({ length: 356 }, (_, i) => i)
    const parts = chunk(rows, BULK_MAX_ROWS)

    expect(parts.every(p => p.length <= BULK_MAX_ROWS)).toBe(true)
    expect(parts.flat()).toEqual(rows) // nothing dropped, nothing reordered
  })

  it('leaves short inputs as a single part and empty ones as none', () => {
    expect(chunk([1, 2, 3], BULK_MAX_ROWS)).toEqual([[1, 2, 3]])
    expect(chunk([], BULK_MAX_ROWS)).toEqual([])
  })
})
