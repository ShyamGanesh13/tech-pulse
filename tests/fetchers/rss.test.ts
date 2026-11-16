import { describe, it, expect } from 'bun:test'
import { fetchRss } from '@/lib/fetchers/rss'

describe('fetchRss', () => {
  it('keeps the newest `limit` items regardless of feed order', async () => {
    const item = (t: string, d: string) =>
      `<item><title>${t}</title><link>https://x/${t.trim()}</link><guid>${t.trim()}</guid><pubDate>${d}</pubDate></item>`
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>f</title>${
      item('old', 'Thu, 01 Jan 2026 00:00:00 GMT')}${
      item(' newest ', 'Sun, 15 Nov 2026 00:00:00 GMT')}${
      item('middle', 'Mon, 01 Jun 2026 00:00:00 GMT')}</channel></rss>`
    global.fetch = (async () => ({ ok: true, text: async () => xml })) as unknown as typeof fetch

    const articles = await fetchRss('openai', 'https://example.test/feed', 2)
    expect(articles.map(a => a.title)).toEqual(['newest', 'middle'])
    expect(articles[0].source).toBe('openai')
    expect(articles[0].id).toMatch(/^openai:[0-9a-f]{32}$/)
    // No byline in the feed → the source's own label.
    expect(articles[0].author).toBe('OpenAI News')
  })

  it('rejects on a non-2xx response so the source is reported as failed', async () => {
    global.fetch = (async () => ({ ok: false, status: 503, statusText: 'Unavailable' })) as unknown as typeof fetch
    await expect(fetchRss('deepmind', 'https://example.test/feed')).rejects.toThrow(/deepmind: 503/)
  })
})
