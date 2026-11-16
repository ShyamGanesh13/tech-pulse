import { describe, it, expect, afterEach } from 'bun:test'
import { similarStories, STORY_SIMILARITY_MIN } from '../lib/embeddings'

const realFetch = global.fetch
const env = { ...process.env }
afterEach(() => { global.fetch = realFetch; process.env = { ...env } })

describe('similarStories', () => {
  const arts = [
    { id: 'a', source: 'decoder', title: 'Meituan releases a 1.6-trillion-parameter agent model that never touched an Nvidia GPU' },
    { id: 'b', source: 'reddit', title: 'Meituan open-sourced LongCat-2.5, a 1.6T agent model, and the only deploy guide is in Chinese' },
    { id: 'c', source: 'techcrunch', title: 'Asian governments react to Nvidia CEO Jensen Huang’s exit' },
    { id: 'd', source: 'hn', title: 'Firm linked to Jensen Huang reportedly brokered $12 billion in Nvidia chip orders' },
    { id: 'e', source: 'lobsters', title: 'A Rust borrow checker walkthrough' },
    { id: 'f', source: 'tldrai', title: 'Meituan agent model, and other news' },
  ]
  // cos(a,b) ≈ 0.99; c/d share title words but sit below the threshold;
  // e embeds identically to a but shares no title words; f is a digest.
  const vectors = new Map([
    ['a', [1, 0, 0]], ['b', [1, 0.1, 0]], ['c', [0, 1, 0]], ['d', [0, 1, 1]], ['e', [1, 0, 0]], ['f', [1, 0, 0]],
  ])

  it('links only cross-source pairs that clear both the threshold and the title guard', () => {
    expect(STORY_SIMILARITY_MIN).toBeGreaterThan(0.71) // cos(c,d)
    const sim = similarStories(arts, vectors, new Set(['tldrai']))
    expect([...sim]).toEqual([['a', ['b']], ['b', ['a']]])
  })

  it('links nothing when there are no embeddings', () => {
    expect(similarStories(arts, new Map()).size).toBe(0)
  })
})

describe('platformAIEmbed', () => {
  it('retries without task_type when the API rejects it, then stops sending it', async () => {
    for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'PLATFORM_AI_PORTAL_ID',
      'PLATFORM_AI_SERVICE_ORG_ID', 'PLATFORM_AI_SERVICE', 'PLATFORM_AI_ZUID']) process.env[k] = 'x'
    // Fresh copy: other test files mock.module this path.
    const { platformAIEmbed } = await import(`../lib/platform-ai?t=${Math.random()}`) as typeof import('../lib/platform-ai')
    const sent: unknown[] = []
    global.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('accounts.zoho.in')) return { ok: true, json: async () => ({ access_token: 't' }) }
      const body = JSON.parse(String(init!.body))
      sent.push(body.task_type)
      return body.task_type
        ? { status: 400, json: async () => ({ error: { code: 400, parameter_name: 'task_type', message: 'Parameter value does not match the expected pattern' } }) }
        : { status: 200, json: async () => ({ data: { results: body.contents.map(() => ({ embeddings: [1, 2] })) } }) }
    }) as unknown as typeof fetch

    expect(await platformAIEmbed(['one'], 'retrieval_document')).toEqual([[1, 2]])
    expect(await platformAIEmbed(['two'], 'retrieval_query')).toEqual([[1, 2]])
    expect(sent).toEqual(['retrieval_document', undefined, undefined])
  })
})
