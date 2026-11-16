import { describe, it, expect } from 'bun:test'
import { groupStories } from '@/lib/story-groups'

let n = 0
const art = (source: string, title: string, url = `https://${source}.test/${++n}`) =>
  ({ id: `${source}:${++n}`, source, title, url })

// Padding so token rarity means something, as it does in a real feed.
const filler = [
  art('arxiv', 'Large language models for protein structure prediction'),
  art('arxiv', 'A survey of large language models in robotics'),
  art('medium', 'Understanding large language models'),
  art('devto', 'Building agents with large language models and tools'),
  art('techcrunch', 'Asian governments react to Nvidia CEO Jensen Huang’s exit'),
  art('decoder', 'Firm linked to Jensen Huang reportedly brokered $12 billion in Nvidia chip orders'),
]

describe('groupStories', () => {
  // Real pairs from the day this was tuned.
  it('folds the same story from another source into the first card', () => {
    const g = groupStories([
      art('deepmind', 'Gemini 4 Carbon is now available'),
      art('techmeme', 'Apple launches its Health AI Usage Study, with an OpenEvidence-powered app that answers health questions'),
      art('decoder', 'Gemini 4 Carbon takes the MathArena crown but costs 15 times more than GPT-6.1 Sol'),
      art('techcrunch', 'Apple launches new app to study how people use AI for health'),
      ...filler,
    ])
    const gemini = g.find(a => a.source === 'deepmind')!
    expect(gemini.also.map(a => a.source)).toEqual(['decoder'])
    const apple = g.find(a => a.source === 'techmeme')!
    expect(apple.also.map(a => a.source)).toEqual(['techcrunch'])
    expect(g.length).toBe(2 + filler.length)
  })

  // A false merge hides a story, so these matter more than the positives.
  it('keeps different stories about the same subject apart', () => {
    const g = groupStories(filler)
    expect(g.every(a => a.also.length === 0)).toBe(true)
  })

  it('never groups two items from the same source', () => {
    const g = groupStories([
      art('deepmind', 'Gemini 4 Carbon is now available'),
      art('deepmind', 'Gemini 4 Carbon is now available in more regions'),
      ...filler,
    ])
    expect(g.every(a => a.also.length === 0)).toBe(true)
  })

  it('leaves digest sources alone', () => {
    const items = [
      art('deepmind', 'Introducing Gemini 4 Hydrogen'),
      art('tldrai', 'Gemini 4 Hydrogen, self-hosted Claude agents, Replit agent commerce'),
      ...filler,
    ]
    expect(groupStories(items).find(a => a.source === 'deepmind')!.also.length).toBe(1)
    expect(groupStories(items, new Set(['tldrai'])).every(a => a.also.length === 0)).toBe(true)
  })

  it('groups the same link regardless of title', () => {
    const g = groupStories([
      art('hn', 'Show HN: a thing', 'https://example.com/post/'),
      art('lobsters', 'Completely different words', 'http://www.example.com/post?utm=x'),
    ])
    expect(g.length).toBe(1)
    expect(g[0].also.length).toBe(1)
  })
})
