import { describe, it, expect } from 'bun:test'
import { fetchReddit } from '@/lib/fetchers/reddit'

const SUBS = ['MachineLearning', 'LocalLLaMA', 'AI_Agents']

// Reddit fetcher uses rss-parser (which uses Node http, not global.fetch).
// We test by monkey-patching Parser.prototype.parseURL instead.
const post = (sub: string, n: number) => ({
  id: `t3_${sub}${n}`,
  title: `Post ${n} in r/${sub}`,
  link: `https://www.reddit.com/r/${sub}/comments/${sub}${n}/slug/`,
  author: 'user1',
})

async function mockFeed(impl: (url: string) => Promise<{ items: unknown[] }>) {
  const Parser = (await import('rss-parser')).default
  Parser.prototype.parseURL = impl as never
}

describe('fetchReddit', () => {
  // The whole point of the rewrite: one request per refresh. Seven sequential
  // requests got all but the first rate-limited on AppSail.
  it('asks for every subreddit in a single request', async () => {
    const urls: string[] = []
    await mockFeed(async url => {
      urls.push(url)
      return { items: SUBS.map(s => post(s, 1)) }
    })

    const articles = await fetchReddit(SUBS)
    expect(urls.length).toBe(1)
    expect(urls[0]).toContain('/r/MachineLearning+LocalLLaMA+AI_Agents/top/')
    expect(articles.map(a => a.subreddit).sort()).toEqual([...SUBS].sort())
    expect(articles.every(a => a.source === 'reddit')).toBe(true)
    expect(articles[0].id).toBe('reddit:MachineLearning1')
  })

  it('caps each subreddit so a big one cannot crowd out the rest', async () => {
    await mockFeed(async () => ({
      items: [...Array.from({ length: 30 }, (_, i) => post('LocalLLaMA', i)), post('AI_Agents', 1)],
    }))
    const articles = await fetchReddit(SUBS)
    expect(articles.filter(a => a.subreddit === 'LocalLLaMA').length).toBe(8)
    expect(articles.filter(a => a.subreddit === 'AI_Agents').length).toBe(1)
  })

  it('drops a repeated link', async () => {
    await mockFeed(async () => ({ items: [post('MachineLearning', 1), post('MachineLearning', 1)] }))
    expect((await fetchReddit(SUBS)).length).toBe(1)
  })

  it('makes no request for an empty subscription', async () => {
    let called = false
    await mockFeed(async () => { called = true; return { items: [] } })
    expect(await fetchReddit([])).toEqual([])
    expect(called).toBe(false)
  })

  // Used to be swallowed into an empty list, which read as "Reddit had nothing".
  it('rejects on a non-429 failure so the source is reported as failed', async () => {
    await mockFeed(async () => { throw new Error('Status code 503') })
    await expect(fetchReddit(SUBS)).rejects.toThrow(/503/)
  })
})
