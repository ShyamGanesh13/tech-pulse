import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { REDDIT_SUBS, REDDIT_PER_SUB } from '../topic-map'

// Reddit blocks unauthenticated .json API calls and throttles bursts.
// We use the RSS/atom feeds with sequential requests + small delays + one retry.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchReddit(): Promise<RawArticle[]> {
  const parser = new Parser({ headers: { 'User-Agent': UA } })
  const now = new Date().toISOString()
  const out: RawArticle[] = []
  const seen = new Set<string>()

  for (const sub of REDDIT_SUBS) {
    const url = `https://www.reddit.com/r/${sub}/top/.rss?t=day&limit=${REDDIT_PER_SUB}`
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
      for (const item of (feed.items ?? []).slice(0, REDDIT_PER_SUB)) {
        const rawId = item.id ?? item.guid ?? item.link ?? item.title ?? ''
        const id = rawId.replace(/^t3_/, '')
        const link = item.link ?? ''
        if (!link || seen.has(link)) continue
        seen.add(link)
        out.push({
          id: `reddit:${id}`,
          source: 'reddit',
          title: item.title ?? 'Untitled',
          url: link,
          score: 0,
          comment_count: 0,
          subreddit: sub,
          author: item.author ?? item.creator ?? null,
          fetched_at: now,
          topics: [],
        })
      }
    }
    await sleep(700)
  }

  return out
}
