import { describe, it, expect, beforeEach } from 'bun:test'
import { validateFeedPrefs, sanitizeFeedPrefs, defaultFeedPrefs } from '@/lib/feed-prefs'
import { getFeedPrefs, setFeedPrefs } from '@/lib/db'
import { SOURCE_KEYS } from '@/lib/source-registry'
import { TOPICS } from '@/lib/topic-map'

const USER = 'test-user-prefs'

describe('validateFeedPrefs', () => {
  it('accepts a valid selection and dedupes it', () => {
    const r = validateFeedPrefs({ sources: ['hn', 'arxiv', 'hn'], topics: ['AI', 'AI'] })
    expect(r).toEqual({ ok: true, prefs: { sources: ['hn', 'arxiv'], topics: ['AI'] } })
  })

  // These values are inlined into ZCQL on Catalyst, which has no parameter
  // binding — the allowlist is the only thing between a request body and a
  // query, so rejection here is security, not tidiness.
  it('rejects anything outside the catalog', () => {
    expect(validateFeedPrefs({ sources: ['hn', 'myspace'], topics: ['AI'] }))
      .toEqual({ ok: false, error: 'Unknown source: myspace' })
    expect(validateFeedPrefs({ sources: ['hn'], topics: ['Underwater Basketry'] }))
      .toEqual({ ok: false, error: 'Unknown topic: Underwater Basketry' })
  })

  it('rejects a quote-bearing source that would close a ZCQL literal', () => {
    const r = validateFeedPrefs({ sources: ["hn' OR '1'='1"], topics: ['AI'] })
    expect(r.ok).toBe(false)
  })

  it('rejects prototype keys posing as catalog entries', () => {
    expect(validateFeedPrefs({ sources: ['toString'], topics: ['AI'] }).ok).toBe(false)
    expect(validateFeedPrefs({ sources: ['hn'], topics: ['constructor'] }).ok).toBe(false)
  })

  // Zero of either means an empty fetch AND an empty feed, which looks exactly
  // like a broken app. Rejected here so the settings panel can explain it.
  it('rejects an empty selection on either axis', () => {
    expect(validateFeedPrefs({ sources: [], topics: ['AI'] }))
      .toEqual({ ok: false, error: 'Select at least one source' })
    expect(validateFeedPrefs({ sources: ['hn'], topics: [] }))
      .toEqual({ ok: false, error: 'Select at least one topic' })
  })

  it('rejects malformed bodies', () => {
    expect(validateFeedPrefs(null).ok).toBe(false)
    expect(validateFeedPrefs('nope').ok).toBe(false)
    expect(validateFeedPrefs({ sources: 'hn', topics: ['AI'] }).ok).toBe(false)
    expect(validateFeedPrefs({ topics: ['AI'] }).ok).toBe(false)
  })
})

describe('sanitizeFeedPrefs', () => {
  it('defaults to the whole catalog when there is no row', () => {
    expect(sanitizeFeedPrefs(null)).toEqual({ sources: [...SOURCE_KEYS], topics: [...TOPICS] })
  })

  // Unlike validate, this REPAIRS: a stale stored row naming a retired source
  // must not break the feed of whoever had it selected.
  it('drops retired entries instead of failing', () => {
    expect(sanitizeFeedPrefs({ sources: ['hn', 'myspace'], topics: ['AI', 'Phrenology'] }))
      .toEqual({ sources: ['hn'], topics: ['AI'] })
  })

  // Filtering everything out must not yield "fetch nothing, show nothing" —
  // a corrupt row should not be able to produce a state the API forbids.
  it('falls back to defaults when filtering empties a list', () => {
    const r = sanitizeFeedPrefs({ sources: ['myspace'], topics: ['Phrenology'] })
    expect(r).toEqual(defaultFeedPrefs())
  })

  it('survives a corrupt cell', () => {
    expect(sanitizeFeedPrefs({ sources: 'not-an-array', topics: 42 })).toEqual(defaultFeedPrefs())
  })
})

describe('feed prefs storage', () => {
  beforeEach(async () => {
    await setFeedPrefs(USER, defaultFeedPrefs())
  })

  it('round-trips a selection', async () => {
    await setFeedPrefs(USER, { sources: ['hn', 'arxiv'], topics: ['LLMs'] })
    expect(await getFeedPrefs(USER)).toEqual({ sources: ['hn', 'arxiv'], topics: ['LLMs'] })
  })

  it('replaces rather than merges', async () => {
    await setFeedPrefs(USER, { sources: ['hn', 'arxiv', 'devto'], topics: ['AI', 'LLMs'] })
    await setFeedPrefs(USER, { sources: ['medium'], topics: ['Data Science'] })
    expect(await getFeedPrefs(USER)).toEqual({ sources: ['medium'], topics: ['Data Science'] })
  })

  it('returns the all-enabled default for a tenant who never saved', async () => {
    const prefs = await getFeedPrefs('test-user-prefs-never-saved')
    expect(prefs.sources).toEqual([...SOURCE_KEYS])
    expect(prefs.topics).toEqual([...TOPICS])
  })

  it('requires a user', async () => {
    await expect(getFeedPrefs('')).rejects.toThrow(/userId is required/)
  })
})
