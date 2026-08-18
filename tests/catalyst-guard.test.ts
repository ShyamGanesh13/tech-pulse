// Structural guards against the two Catalyst failure modes that produce NO error.
//
// Both were measured against the live datastore, and both look like healthy code:
//
//   1. `LIKE 'prefix%'` returns ZERO ROWS with no error, because Catalyst's
//      wildcard is `*`, not `%`. On Turso the same SQL is correct, so a ported
//      query keeps compiling, keeps passing review, and silently returns nothing.
//      In this app that would empty the agenda, the calendar dots and the whole
//      finance module (which would read as ₹0 rather than an error).
//
//   2. `Number(rowid)` silently corrupts ids. Catalyst ROWIDs are 17 digits,
//      exceeding Number.MAX_SAFE_INTEGER, and the row API returns them as raw
//      JSON numbers: 51859000000046006 parses to 51859000000046010.
//
// Neither is catchable by tsc (string in, string out; number in, number out) and
// neither throws at runtime. Hence a lexical guard.
//
// SCOPE: only Catalyst-bound files. lib/db.ts legitimately uses `%` because
// SQLite's wildcard IS `%`.
import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { likePrefix } from '@/lib/catalyst'

const CATALYST_FILES = readdirSync('lib')
  .filter(f => f.endsWith('-catalyst.ts') || f === 'catalyst.ts')
  .map(f => `lib/${f}`)

describe('catalyst guard: % wildcard', () => {
  it('finds the Catalyst adapter files it is meant to police', () => {
    // If this fails the guard is silently policing nothing.
    expect(CATALYST_FILES.length).toBeGreaterThan(0)
    expect(CATALYST_FILES).toContain('lib/catalyst.ts')
  })

  it('no Catalyst-bound SQL uses % as a wildcard', () => {
    const offenders: string[] = []
    for (const file of CATALYST_FILES) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return // comments explain the rule
        if (!/\blike\b/i.test(line)) return
        if (line.includes('%')) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('likePrefix builds a *-terminated pattern, not %', () => {
    const p = likePrefix('2026-08')
    expect(p).toBe("'2026-08*'")
    expect(p).not.toContain('%')
  })
})

describe('catalyst guard: ROWID must never become a number', () => {
  it('no Catalyst adapter passes a ROWID through Number() or parseInt()', () => {
    const offenders: string[] = []
    for (const file of CATALYST_FILES) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
        if (/(Number|parseInt)\s*\([^)]*(ROWID|rowid)/.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('demonstrates the corruption the guard exists to prevent', () => {
    // Documents the measured bug so the guard's purpose survives refactoring.
    const realRowId = '51859000000046006'
    const viaJsonParse = JSON.parse(`{"ROWID":${realRowId}}`).ROWID
    expect(String(viaJsonParse)).not.toBe(realRowId)
    expect(String(viaJsonParse)).toBe('51859000000046010')
  })
})
