import { describe, test, expect, afterEach } from 'bun:test'
import { keywordTopics, matchesTopics, TOPICS, TOPIC_KEYWORDS } from '../lib/topic-map'

const realFetch = global.fetch
const env = { ...process.env }

afterEach(() => {
  global.fetch = realFetch
  process.env = { ...env }
})

function isolate(): Promise<typeof import('../lib/classifier')> {
  // Fresh module each time so the env read inside pickBackend is re-evaluated.
  return import(`../lib/classifier?t=${Math.random()}`)
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

  test('uses the LLM verdict when a backend answers', async () => {
    process.env.OLLAMA_HOST = 'http://ollama.test'
    delete process.env.OPENAI_API_KEY
    global.fetch = (async (url: string) => {
      if (String(url).endsWith('/api/tags')) return { ok: true, json: async () => ({}) } as Response
      return {
        ok: true,
        json: async () => ({ message: { content: JSON.stringify([
          { id: 'hn:1', topics: ['AI', 'LLMs'] },
          { id: 'hn:2', topics: [] },
        ]) } }),
      } as Response
    }) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('llm')
    expect(r.backend).toBe('ollama')
    expect(r.topics.get('hn:1')).toEqual(['AI', 'LLMs'])
    // An LLM verdict of "no topics" is authoritative, and must be marked as such.
    expect(r.topics.get('hn:2')).toEqual([])
    expect(r.llmVerdicts.has('hn:2')).toBe(true)
  })

  test('falls back to keywords, not to nothing, when no backend is reachable', async () => {
    process.env.OLLAMA_HOST = 'http://10.71.105.88:11434'
    delete process.env.OPENAI_API_KEY
    global.fetch = (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('keyword')
    expect(r.backend).toBe('none')
    expect(r.note).toContain('unreachable')
    // The whole point: real topics survive an unreachable model host.
    expect(r.topics.get('hn:1')).toContain('LLMs')
    // And nothing is presented as a considered verdict.
    expect(r.llmVerdicts.size).toBe(0)
  })

  test('an unreachable Ollama no longer blocks the OpenAI fallback', async () => {
    process.env.OLLAMA_HOST = 'http://10.71.105.88:11434'
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = (async (url: string) => {
      if (String(url).includes('10.71.105.88')) throw new Error('ECONNREFUSED')
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify([
          { id: 'hn:1', topics: ['LLMs'] },
          { id: 'hn:2', topics: [] },
        ]) } }] }),
      } as Response
    }) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.backend).toBe('openai')
    expect(r.mode).toBe('llm')
    expect(r.note).toContain('OpenAI')
  })

  test('a failed batch keeps keyword topics instead of emptying them', async () => {
    process.env.OLLAMA_HOST = 'http://ollama.test'
    delete process.env.OPENAI_API_KEY
    global.fetch = (async (url: string) => {
      if (String(url).endsWith('/api/tags')) return { ok: true, json: async () => ({}) } as Response
      return { ok: true, json: async () => ({ message: { content: 'not json at all' } }) } as Response
    }) as typeof fetch

    const { classifyArticles } = await isolate()
    const r = await classifyArticles(articles)
    expect(r.mode).toBe('keyword')
    expect(r.topics.get('hn:1')).toContain('LLMs')
    expect(r.note).toContain('batches failed')
  })
})
