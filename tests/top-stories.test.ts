import { describe, it, expect } from 'bun:test'
import { topStories } from '@/lib/top-stories'

const s = (id: string, source: string, also: number, relevance: number, topics = ['AI'], score = 0) =>
  ({ id, source, topics, relevance, score, also: Array.from({ length: also }, () => ({ id: 'x', source: 'x', topics, relevance, score })) })

describe('topStories', () => {
  it('ranks by cross-source coverage, then relevance, then score', () => {
    const out = topStories([
      s('rel', 'arxiv', 0, 14),
      s('covered', 'hn', 2, 1),
      s('hot', 'hn', 0, 14, ['AI'], 500),
    ])
    expect(out.map(x => x.id)).toEqual(['covered', 'hot', 'rel'])
  })

  it('skips untagged articles and digest sources, and caps at n', () => {
    const out = topStories(
      [s('untagged', 'hn', 3, 9, []), s('digest', 'tldrai', 0, 11), s('a', 'hn', 0, 2), s('b', 'hn', 0, 1)],
      1, new Set(['tldrai']),
    )
    expect(out.map(x => x.id)).toEqual(['a'])
  })
})
