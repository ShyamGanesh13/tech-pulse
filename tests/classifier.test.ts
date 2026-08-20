import { describe, test, expect, afterEach } from 'bun:test'
import { keywordTopics, matchesTopics, TOPICS, TOPIC_KEYWORDS } from '../lib/topic-map'
import { _resetPlatformAITokenCacheForTests } from '../lib/platform-ai'

const realFetch = global.fetch
const env = { ...process.env }

afterEach(() => {
  global.fetch = realFetch
  process.env = { ...env }
  _resetPlatformAITokenCacheForTests()
})

function isolate(): Promise<typeof import('../lib/classifier')> {
  // Fresh module each time so the env read inside pickBackend is re-evaluated.
  return import(`../lib/classifier?t=${Math.random()}`)
}

/** Everything platformAIConfigured() needs to return true. */
function configurePlatformAI() {
  process.env.ZOHO_CLIENT_ID = 'test-client-id'
  process.env.ZOHO_CLIENT_SECRET = 'test-client-secret'
  process.env.ZOHO_REFRESH_TOKEN = 'test-refresh-token'
  process.env.PLATFORM_AI_PORTAL_ID = '111'
  process.env.PLATFORM_AI_SERVICE_ORG_ID = '222'
  process.env.PLATFORM_AI_SERVICE = '8'
  process.env.PLATFORM_AI_ZUID = '333'
}

/** Mocks the OAuth token endpoint; the caller mocks the PlatformAI chat endpoint itself. */
function withTokenMint(chatHandler: (url: string) => Promise<Response>): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('accounts.zoho.in')) {
      return { ok: true, json: async () => ({ access_token: 'test-access-token' }) } as Response
    }
    return chatHandler(String(url))
  }) as typeof fetch
}

describe('keywordTopics', () => {
  test('tags an unambiguous title with no network call', () => {
    expect(keywordTopics('Optimizers in Deep Learning: From Gradient Descent to Adam'))
      .toEqual(['AI', 'Deep Learning'])
  })

  test('matches space-padded keywords across punctuation', () => {
    // ' ai ' must survive the hyphen — the old raw-only match silently missed this
    expect(keywordTopics('Why AI-powered search still fails')).toContain('AI')
    expect(keywordTopics('A note on (AI) safety')).toContain('AI')
  })

  test('an AI subfield implies AI, so the AI pill is a superset', () => {
    const topics = keywordTopics('Fine-tuning Llama 3 with RLHF')
    expect(topics).toContain('AI')
    expect(topics).toContain('Reinforcement Learning')
  })

  test('data science does not imply AI', () => {
    expect(keywordTopics('Building a data pipeline with dbt')).toEqual(['Data Science'])
  })

  test('returns nothing for a genuinely unrelated title', () => {
    expect(keywordTopics('6 Things I Learned From Watching My Friend Rebuild Their Resume')).toEqual([])
  })

  test('every keyword table key is a real topic', () => {
    for (const key of Object.keys(TOPIC_KEYWORDS)) expect(TOPICS).toContain(key)
  })
})

describe('matchesTopics', () => {
  test('keeps the recall-only terms the pre-filter relies on', () => {
    // Too generic to tag with, but must still pass the HN/Lobsters net.
    expect(matchesTopics('A new benchmark for compilers')).toBe(true)
    expect(keywordTopics('A new benchmark for compilers')).toEqual([])
  })

  test('rejects an off-topic title', () => {
    expect(matchesTopics('Rewriting our CSS in Sass')).toBe(false)
  })
})

describe('classifyArticles', () => {
  const articles = [
    { id: 'hn:1', title: 'GPT-5 LLM beats all benchmarks' },
    { id: 'hn:2', title: 'New JavaScript framework released' },
  ]

  test('uses the LLM verdict when PlatformAI answers', async () => {
    configurePlatformAI()
    delete process.env.OPENAI_API_KEY
    global.fetch = withTokenMint(async () => ({
      ok: true,
      json: async () => ({ data: { results: [JSON.stringify([
        { id: 'hn:1', topics: ['AI', 'LLMs'] },
        { id: 'hn:2', topics: [] },
      ])] } }),
    } as Response))

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('llm')
    expect(r.backend).toBe('platformai')
    expect(r.topics.get('hn:1')).toEqual(['AI', 'LLMs'])
    // An LLM verdict of "no topics" is authoritative, and must be marked as such.
    expect(r.topics.get('hn:2')).toEqual([])
    expect(r.llmVerdicts.has('hn:2')).toBe(true)
  })

  test('falls back to keywords, not to nothing, when no backend is configured', async () => {
    delete process.env.ZOHO_CLIENT_ID
    delete process.env.ZOHO_CLIENT_SECRET
    delete process.env.ZOHO_REFRESH_TOKEN
    delete process.env.PLATFORM_AI_PORTAL_ID
    delete process.env.PLATFORM_AI_SERVICE_ORG_ID
    delete process.env.PLATFORM_AI_SERVICE
    delete process.env.PLATFORM_AI_ZUID
    delete process.env.OPENAI_API_KEY
    global.fetch = (async () => { throw new Error('should not be called') }) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('keyword')
    expect(r.backend).toBe('none')
    expect(r.note).toContain('No AI backend configured')
    // The whole point: real topics survive a missing model backend.
    expect(r.topics.get('hn:1')).toContain('LLMs')
    // And nothing is presented as a considered verdict.
    expect(r.llmVerdicts.size).toBe(0)
  })

  test('PlatformAI not being configured no longer blocks the OpenAI fallback', async () => {
    delete process.env.ZOHO_CLIENT_ID
    delete process.env.ZOHO_CLIENT_SECRET
    delete process.env.ZOHO_REFRESH_TOKEN
    delete process.env.PLATFORM_AI_PORTAL_ID
    delete process.env.PLATFORM_AI_SERVICE_ORG_ID
    delete process.env.PLATFORM_AI_SERVICE
    delete process.env.PLATFORM_AI_ZUID
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify([
        { id: 'hn:1', topics: ['LLMs'] },
        { id: 'hn:2', topics: [] },
      ]) } }] }),
    } as Response)) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.backend).toBe('openai')
    expect(r.mode).toBe('llm')
    expect(r.note).toContain('OpenAI')
  })

  test('a failed PlatformAI batch keeps keyword topics instead of emptying them', async () => {
    configurePlatformAI()
    delete process.env.OPENAI_API_KEY
    global.fetch = withTokenMint(async () => ({
      ok: true,
      json: async () => ({ data: { results: ['not json at all'] } }),
    } as Response))

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('keyword')
    expect(r.topics.get('hn:1')).toContain('LLMs')
    expect(r.note).toContain('batches failed')
  })
})
