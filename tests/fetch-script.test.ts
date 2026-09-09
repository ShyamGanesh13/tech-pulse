import { describe, it, expect, beforeEach, mock } from 'bun:test'
import type { Classification } from '@/lib/classifier'

// Swapped per test so the pipeline's behaviour under a healthy, partial and dead
// classifier can all be exercised. mock.module is module-level, so the indirection
// through a mutable binding is what makes it per-case.
let classify: (articles: { id: string; title: string }[]) => Promise<Classification>

const keywordOnly = async (articles: { id: string }[]): Promise<Classification> => ({
  topics: new Map(articles.map(a => [a.id, [] as string[]])),
  llmVerdicts: new Set<string>(),
  backend: 'none',
  mode: 'keyword',
})

mock.module('../lib/classifier', () => ({
  classifyArticles: (articles: { id: string; title: string }[]) => classify(articles),
}))

const { runFetch } = await import('@/scripts/fetch')
const { getArticles, clearNonBookmarkedArticles } = await import('@/lib/db')

const USER = 'test-user-fetch'

/** Every outbound URL the run touched, whether via fetch() or rss-parser. */
let urls: string[] = []

beforeEach(async () => {
  urls = []
  classify = keywordOnly
  await clearNonBookmarkedArticles(USER)

  global.fetch = async (url: string) => {
    const u = String(url)
    urls.push(u)
    if (u.includes('beststories')) return { json: async () => [] } as Response
    if (u.includes('dev.to')) {
      const tag = new URL(u).searchParams.get('tag') ?? 'x'
      return {
        json: async () => [{
          id: `${tag.length}${tag.charCodeAt(0)}`,
          title: `${tag} post`,
          url: `https://dev.to/a/${tag}`,
          positive_reactions_count: 1,
          comments_count: 0,
          user: { username: 'a' },
        }],
      } as Response
    }
    return { json: async () => [] } as Response
  }

  const Parser = (await import('rss-parser')).default
  Parser.prototype.parseURL = async (url: string) => {
    urls.push(String(url))
    return { items: [] }
  }
})

describe('runFetch source scoping', () => {
  it('touches only the subscribed sources', async () => {
    await runFetch({ userId: USER, sources: ['devto'], topics: ['LLMs'] })

    expect(urls.some(u => u.includes('dev.to'))).toBe(true)
    // Nothing from HN, Reddit, arXiv, Medium or the blog feeds.
    expect(urls.some(u => u.includes('hacker-news'))).toBe(false)
    expect(urls.some(u => u.includes('reddit.com'))).toBe(false)
    expect(urls.some(u => u.includes('arxiv.org'))).toBe(false)
    expect(urls.some(u => u.includes('medium.com'))).toBe(false)
  })

  it('requests only the tags the subscribed topics map to', async () => {
    await runFetch({ userId: USER, sources: ['devto'], topics: ['LLMs'] })

    const tags = urls
      .filter(u => u.includes('dev.to'))
      .map(u => new URL(u).searchParams.get('tag'))
    expect(tags).toEqual(['llm'])
  })

  // Transformers maps to no native tag on any source, so without the
  // defaultTags fallback this run would request nothing and return an empty
  // feed for a perfectly legal subscription.
  it('falls back to the broad tag when no subscribed topic maps to the source', async () => {
    await runFetch({ userId: USER, sources: ['devto'], topics: ['Transformers'] })

    const tags = urls
      .filter(u => u.includes('dev.to'))
      .map(u => new URL(u).searchParams.get('tag'))
    expect(tags).toEqual(['ai'])
  })

  // Pragmatic Engineer awaits its single feed directly, so a dead feed rejects
  // and shows up in `failed`. Multi-tag sources like Medium and Dev.to wrap
  // their requests in Promise.allSettled on purpose — one dead tag must not
  // take the whole source down — so they resolve empty instead of rejecting,
  // and asserting on them here would be testing the wrong thing.
  it('reports a failed source without aborting the others', async () => {
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async () => { throw new Error('RSS failed') }

    const result = await runFetch({ userId: USER, sources: ['devto', 'pragmatic'], topics: ['LLMs'] })
    expect(result.failed).toContain('Pragmatic Engineer')
    // The healthy source still ran.
    expect(urls.some(u => u.includes('dev.to'))).toBe(true)
  })
})

describe('runFetch topic filtering', () => {
  it('drops articles the LLM tagged outside the subscription', async () => {
    classify = async articles => ({
      topics: new Map(articles.map(a => [
        a.id,
        a.title.includes('llm') ? ['LLMs'] : ['Data Science'],
      ])),
      llmVerdicts: new Set(articles.map(a => a.id)),
      backend: 'platformai',
      mode: 'llm',
    })

    // 'ai' and 'llm' tags are both requested, so two articles come back; only
    // the one tagged LLMs is subscribed.
    const result = await runFetch({ userId: USER, sources: ['devto'], topics: ['AI', 'LLMs'] })

    expect(result.filtered).toBeGreaterThan(0)
    const stored = await getArticles(USER, 'all', 50)
    expect(stored.every(a => a.topics.includes('LLMs'))).toBe(true)
  })

  // THE IMPORTANT ONE. Commit 931395f fixed a bug where an unreachable model
  // host made every article look off-topic. Hard-filtering on a keyword-only
  // classification would turn that into deletion and hand the tenant an empty
  // feed during a model outage.
  it('filters nothing when the classifier is unavailable', async () => {
    const result = await runFetch({ userId: USER, sources: ['devto'], topics: ['LLMs'] })

    expect(result.filtered).toBe(0)
    expect(result.total).toBeGreaterThan(0)
    const stored = await getArticles(USER, 'all', 50)
    expect(stored.length).toBeGreaterThan(0)
  })

  // A keyword guess is not trustworthy enough to delete on, so in partial mode
  // only articles the LLM actually answered for are eligible.
  it('spares keyword-derived articles in partial mode', async () => {
    classify = async articles => ({
      // Every article is tagged off-subscription, but only the first got an
      // actual LLM verdict.
      topics: new Map(articles.map(a => [a.id, ['Data Science']])),
      llmVerdicts: new Set(articles.slice(0, 1).map(a => a.id)),
      backend: 'platformai',
      mode: 'partial',
    })

    const result = await runFetch({ userId: USER, sources: ['devto'], topics: ['AI', 'LLMs'] })

    // Exactly the one LLM-verdict article was dropped; the rest survived.
    expect(result.filtered).toBe(1)
    expect(result.total).toBeGreaterThan(0)
  })
})

describe('runFetch tenant isolation', () => {
  it('leaves another tenant\'s rows alone', async () => {
    const OTHER = 'test-user-fetch-other'
    await clearNonBookmarkedArticles(OTHER)
    const { upsertArticles } = await import('@/lib/db')
    await upsertArticles(OTHER, [{
      id: 'hn:other', source: 'hn', title: 'Other tenant row',
      url: 'https://example.com/o', score: 1, comment_count: 0,
      subreddit: null, author: null, fetched_at: new Date().toISOString(), topics: ['AI'],
    }])

    await runFetch({ userId: USER, sources: ['devto'], topics: ['LLMs'] })

    const theirs = await getArticles(OTHER, 'all', 50)
    expect(theirs.map(a => a.id)).toContain('hn:other')
    await clearNonBookmarkedArticles(OTHER)
  })
})
