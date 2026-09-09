import { describe, it, expect } from 'bun:test'
import { SOURCES, SOURCE_KEYS, isSource, resolveTags, type SourceDef } from '@/lib/source-registry'
import { TOPICS } from '@/lib/topic-map'

const defs = Object.entries(SOURCES) as [string, SourceDef][]

describe('source registry structure', () => {
  // The motivating bug: the topic a native tag serves used to be a trailing
  // comment, so a misspelled topic name was invisible. Now it is a key that has
  // to resolve against TOPICS, and this test is what makes a typo fail loudly
  // instead of silently mapping to zero articles.
  it('maps every topicTags key to a real topic', () => {
    for (const [key, def] of defs) {
      for (const topic of Object.keys(def.topicTags ?? {})) {
        expect(TOPICS, `${key} declares unknown topic "${topic}"`).toContain(topic)
      }
    }
  })

  it('gives native sources the tags they need and keyword sources none', () => {
    for (const [key, def] of defs) {
      if (def.tier === 'native') {
        expect(Object.keys(def.topicTags ?? {}).length, `${key} topicTags`).toBeGreaterThan(0)
        // Without defaultTags a topic selection that maps to nothing on this
        // source yields an empty tag set and silently returns no articles.
        expect(def.defaultTags?.length, `${key} defaultTags`).toBeGreaterThan(0)
        expect(def.perTag, `${key} perTag`).toBeGreaterThan(0)
      } else {
        expect(def.topicTags, `${key} is keyword-tier`).toBeUndefined()
        expect(def.defaultTags, `${key} is keyword-tier`).toBeUndefined()
      }
    }
  })

  it('declares presentation for every source', () => {
    for (const [key, def] of defs) {
      expect(def.label, `${key} label`).toBeTruthy()
      expect(def.shortLabel, `${key} shortLabel`).toBeTruthy()
      expect(def.color, `${key} color`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('keeps SOURCE_KEYS in step with SOURCES', () => {
    expect(SOURCE_KEYS).toEqual(Object.keys(SOURCES))
    expect(SOURCE_KEYS.length).toBe(10)
  })

  it('narrows unvalidated input', () => {
    expect(isSource('hn')).toBe(true)
    expect(isSource('all')).toBe(false)
    expect(isSource('')).toBe(false)
    expect(isSource(undefined)).toBe(false)
    // Would otherwise let a prototype key through into a query string.
    expect(isSource('toString')).toBe(false)
  })
})

describe('resolveTags', () => {
  it('returns only the tags serving the enabled topics', () => {
    expect(resolveTags('devto', ['LLMs']).sort()).toEqual(['llm'])
    expect(resolveTags('devto', ['AI']).sort()).toEqual(['ai', 'artificialintelligence'])
  })

  it('unions tags across several enabled topics without duplicates', () => {
    const tags = resolveTags('devto', ['AI', 'LLMs', 'Agentic AI'])
    expect(tags.sort()).toEqual(['ai', 'aiagents', 'artificialintelligence', 'llm'])
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('ignores topics the source has no tag for', () => {
    // Dev.to has no Transformers tag, but does have one for LLMs.
    expect(resolveTags('devto', ['Transformers', 'LLMs'])).toEqual(['llm'])
  })

  // The load-bearing fallback. Transformers, Latest Models and Reinforcement
  // Learning map to no native tag on any source, so without this a user who
  // enables only those gets an empty feed from every native source.
  it('falls back to defaultTags when no enabled topic maps to the source', () => {
    expect(resolveTags('devto', ['Transformers'])).toEqual(['ai'])
    expect(resolveTags('reddit', ['Latest Models'])).toEqual(['MachineLearning', 'artificial'])
    expect(resolveTags('medium', ['Reinforcement Learning'])).toEqual(['artificial-intelligence'])
    expect(resolveTags('arxiv', ['Transformers'])).toEqual(['https://export.arxiv.org/rss/cs.AI'])
  })

  it('falls back for an empty topic selection too', () => {
    expect(resolveTags('devto', [])).toEqual(['ai'])
  })

  it('returns nothing for keyword-tier sources, which narrow on titles instead', () => {
    expect(resolveTags('hn', ['AI'])).toEqual([])
    expect(resolveTags('lobsters', TOPICS)).toEqual([])
    expect(resolveTags('githubblog', ['LLMs'])).toEqual([])
  })

  it('gives arXiv full feed URLs, since that is what its fetcher consumes', () => {
    for (const feed of resolveTags('arxiv', TOPICS)) {
      expect(feed).toMatch(/^https:\/\/export\.arxiv\.org\/rss\//)
    }
  })
})
