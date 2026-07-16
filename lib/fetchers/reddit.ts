import Parser from 'rss-parser'
import type { RawArticle } from '../types'

// Reddit blocks the unauthenticated .json API (HTTP 403) and throttles bursts
// (HTTP 429) from non-browser / datacenter IPs. We use the RSS/atom feeds and
// fetch subreddits sequentially with small delays + a single retry, skipping
// any subreddit that stays rate-limited rather than failing the whole source.
const SUBREDDITS = ['programming', 'MachineLearning', 'webdev']
const LIMIT_PER_SUB = 10
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchReddit(): Promise<RawArticle[]> {
  const parser = new Parser({ headers: { 'User-Agent': UA } })
  const now = new Date().toISOString()
  const out: RawArticle[] = []
  const seen = new Set<string>()

  for (const sub of SUBREDDITS) {
    const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day&limit=${LIMIT_PER_SUB}`
    let feed
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        feed = await parser.parseURL(url)
        break
      } catch (e) {
        if (attempt === 0 && String(e).includes('429')) { await sleep(2500); continue }
        console.warn(`[reddit] r/${sub} failed: ${String(e)}`)
      }
    }
    if (feed) {
      for (const item of (feed.items ?? []).slice(0, LIMIT_PER_SUB)) {
        const rawId = item.id ?? item.guid ?? item.link ?? item.title ?? ''
        const id = rawId.replace(/^t3_/, '') // strip Reddit's atom id prefix
        const link = item.link ?? ''
        if (!link || seen.has(link)) continue
        seen.add(link)
        out.push({
          id: `reddit:${id}`,
          source: 'reddit',
          title: item.title ?? 'Untitled',
          url: link,
          score: 0, // not exposed via RSS
          comment_count: 0, // not exposed via RSS
          subreddit: sub,
          author: item.author ?? item.creator ?? null,
          fetched_at: now,
          topics: [],
        })
      }
    }
    await sleep(700) // spread requests to avoid Reddit's burst throttle
  }
  return out
}
