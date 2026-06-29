import { describe, test, expect, mock, beforeEach } from 'bun:test'

const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

describe('classifyArticles', () => {
  test('returns matched topics for relevant articles', async () => {
    mock.module('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: async () => ({
            content: [{ type: 'text', text: JSON.stringify([
              { id: 'hn:1', topics: ['AI', 'LLMs'] },
              { id: 'hn:2', topics: [] }
            ]) }]
          })
        }
      }
    }))
    const { classifyArticles } = await import('../lib/classifier')
    const result = await classifyArticles([
      { id: 'hn:1', title: 'GPT-5 LLM beats all benchmarks' },
      { id: 'hn:2', title: 'New JavaScript framework released' }
    ])
    expect(result.get('hn:1')).toEqual(['AI', 'LLMs'])
    expect(result.get('hn:2')).toEqual([])
  })

  test('returns empty map on API failure', async () => {
    mock.module('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: async () => { throw new Error('API error') } }
      }
    }))
    const { classifyArticles } = await import('../lib/classifier')
    const result = await classifyArticles([{ id: 'hn:1', title: 'Test' }])
    expect(result.get('hn:1')).toEqual([])
  })
})
