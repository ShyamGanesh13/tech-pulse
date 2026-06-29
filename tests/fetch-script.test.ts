import { describe, it, expect, afterEach } from 'bun:test'
import { unlinkSync } from 'fs'
import { runFetch } from '@/scripts/fetch'
import { getArticles } from '@/lib/db'

const TEST_DB = '/tmp/tech-pulse-fetch-test.db'

afterEach(() => {
  try { unlinkSync(TEST_DB) } catch {}
})

describe('runFetch', () => {
  it('fetches from all sources and upserts to DB, skipping failed sources', async () => {
    let hnCalled = false, redditCalled = false, devtoCalled = false, mediumCalled = false

    global.fetch = async (url: string) => {
      const u = String(url)
      if (u.includes('hacker-news')) {
        hnCalled = true
        if (u.includes('topstories')) return { json: async () => [] } as Response
        return { json: async () => null } as Response
      }
      if (u.includes('reddit.com')) {
        redditCalled = true
        return { json: async () => ({ data: { children: [] } }) } as Response
      }
      if (u.includes('dev.to')) {
        devtoCalled = true
        return { json: async () => [] } as Response
      }
      throw new Error('Network error')
    }

    // Mock rss-parser to throw (simulating Medium failure)
    const Parser = (await import('rss-parser')).default
    Parser.prototype.parseURL = async () => { throw new Error('RSS failed') }

    const result = await runFetch(TEST_DB)
    expect(hnCalled).toBe(true)
    expect(redditCalled).toBe(true)
    expect(devtoCalled).toBe(true)
    // Medium failed — result should note it
    expect(result.failed).toContain('Medium')
    expect(result.total).toBe(0) // all returned empty arrays
  })
})
