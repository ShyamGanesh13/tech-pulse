import { describe, expect, it, mock } from 'bun:test'

// Keep the deadline short so the "backend hangs" case doesn't take 20 real seconds.
process.env.AI_CATEGORIZE_DEADLINE_MS = '300'

const prompts: string[] = []
let chat: (opts: { messages: { role: string; content: string }[] }) => Promise<string>

mock.module('../lib/platform-ai', () => ({
  platformAIConfigured: () => true,
  platformAIChat: (opts: { messages: { role: string; content: string }[] }) => {
    prompts.push(opts.messages[0].content)
    return chat(opts)
  },
}))

const { aiCategorize } = await import('../lib/ai-categorize')

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, description: `txn ${i}` }))

// Pull the ids a prompt asked about, so we can assert how the work was split.
const idsIn = (prompt: string) => [...prompt.matchAll(/\{"id":"(\d+)"/g)].map(m => Number(m[1]))

describe('aiCategorize', () => {
  it('splits a long statement into batches instead of one giant prompt', async () => {
    prompts.length = 0
    chat = async opts =>
      JSON.stringify(idsIn(opts.messages[0].content).map(id => ({ id, category: 'Transport' })))

    const out = await aiCategorize(items(35))

    expect(prompts.length).toBe(3)
    expect(idsIn(prompts[0]).length).toBe(15)
    expect(idsIn(prompts[2]).length).toBe(5)
    expect(out.get(0)).toBe('Transport')
    expect(out.get(34)).toBe('Transport')
  })

  it('returns "Other" on its own deadline rather than hanging past the gateway timeout', async () => {
    prompts.length = 0
    chat = () => new Promise<string>(() => {}) // backend never answers

    const started = Date.now()
    const out = await aiCategorize(items(20))

    expect(Date.now() - started).toBeLessThan(3000)
    expect(out.get(0)).toBe('Other')
    expect(out.size).toBe(20)
  })
})
