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

describe('catalyst guard: per-tenant synthetic keys', () => {
  // Catalyst has no composite unique constraint, so `PRIMARY KEY (user_id, x)`
  // is emulated by a synthetic `uk` column. Now that articles and their topics
  // are per-tenant, a uk missing user_id is a silent cross-tenant collision: the
  // second tenant to fetch the same article 409s the whole batch, or worse,
  // updates the first tenant's row. Neither is a type error.
  const src = readFileSync('lib/articles-catalyst.ts', 'utf8')

  it('builds the articles uk from user_id and article_id', () => {
    expect(src).toContain('function artUk(owner: string, articleId: string)')
    expect(src).toContain('`${owner}|${articleId}`')
  })

  it('builds the article_topics uk from user_id, article_id and topic', () => {
    expect(src).toContain('function topicUk(owner: string, articleId: string, topic: string)')
    expect(src).toContain('`${owner}|${articleId}|${topic}`')
    expect(src).toContain('uk: topicUk(owner, a.id, safeTopic(t))')
  })

  // article_topics.uk is varchar(200) in the live datastore while the key can
  // reach 230 chars, and Catalyst truncates varchar SILENTLY — two distinct keys
  // would collapse into one. The column needs widening to 255; this check is
  // what turns the failure mode into an exception if it ever gets close again.
  it('refuses to build a uk that would truncate', () => {
    expect(src).toContain('const UK_MAX = 255')
    expect(src).toContain('would truncate silently')
    // Both key builders go through the check rather than only one.
    expect(src).toContain("checkedUk(`${owner}|${articleId}`, 'articles')")
    expect(src).toContain("checkedUk(`${owner}|${articleId}|${topic}`, 'article_topics')")
  })

  // The existence probe in upsertArticles must match on uk, not article_id:
  // probing on article_id alone finds ANOTHER tenant's row and turns an insert
  // into an update of their data.
  it('probes for existing rows on uk, never on article_id alone', () => {
    expect(src).toContain('WHERE uk IN (${uks})')
    expect(src).not.toContain('WHERE article_id IN (${ids})`, T_ART')
  })

  // Every per-tenant read has to carry a user_id filter. articles and
  // article_topics are the tables that changed, so they are the ones to police.
  it('scopes every articles and article_topics query by user_id', () => {
    const offenders: string[] = []
    src.split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
      if (!/(SELECT|DELETE)\b/.test(line)) return
      if (!/T_ART|T_TOPIC/.test(line)) return
      // The statement may wrap, so look at the whole template literal.
      const stmt = src.slice(src.indexOf(line), src.indexOf(line) + 400)
      const clause = stmt.slice(0, stmt.indexOf('`, T_') + 1)
      if (!/user_id = '\$\{owner\}'|uk IN|uk = /.test(clause)) {
        offenders.push(`lib/articles-catalyst.ts:${i + 1}  ${line.trim()}`)
      }
    })
    expect(offenders).toEqual([])
  })

  // Summaries and embeddings are the deliberate exception: shared across
  // tenants, keyed on article_id alone. If they ever gain a user_id the cost
  // saving is gone, so the intent is asserted rather than left to a comment.
  it('keeps summaries and embeddings global', () => {
    expect(src).toContain("const T_SUM = 'article_summaries'")
    expect(src).toContain("const T_EMB = 'article_embeddings'")
    for (const stmt of src.split('\n').filter(l => /T_SUM|T_EMB/.test(l))) {
      expect(stmt).not.toContain('user_id')
    }
  })
})

