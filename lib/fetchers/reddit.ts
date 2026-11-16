import Parser from 'rss-parser'
import type { RawArticle } from '../types'
import { SOURCES } from '../source-registry'

const PER_SUB = SOURCES.reddit.perTag

// Reddit blocks unauthenticated .json API calls and throttles bursts by IP.
//
// ONE request for all subreddits (a "multireddit": r/a+b+c), not one per sub.
// The per-sub loop made up to seven requests in ~15s, and from AppSail's
// datacenter IP only the first got through — the rest came back 429 even with
// a delay and a retry, so most subscribed subreddits were silently missing.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Reddit's listing limit.
const MAX_ITEMS = 100
// Waits before the 2nd and 3rd attempt. Short on purpose: the whole refresh
// shares one AppSail request budget.
const RETRY_DELAYS_MS = [2000, 4000]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** `subs` comes from resolveTags('reddit', enabledTopics) — never the full list. */
export async function fetchReddit(subs: string[]): Promise<RawArticle[]> {
  if (subs.length === 0) return []
  const parser = new Parser({ headers: { 'User-Agent': UA }, timeout: 15_000 })
  const limit = Math.min(MAX_ITEMS, PER_SUB * subs.length)
  const url = `https://www.reddit.com/r/${subs.join('+')}/top/.rss?t=day&limit=${limit}`

  let feed
  for (let attempt = 0; ; attempt++) {
    try {
      feed = await parser.parseURL(url)
      break
    } catch (e) {
      // Thrown, not swallowed: an empty Reddit section with no explanation is
      // how this went unnoticed. runFetch lists the source as failed instead.
      if (attempt >= RETRY_DELAYS_MS.length || !String(e).includes('429')) throw e
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }

  const now = new Date().toISOString()
  const out: RawArticle[] = []
  const seen = new Set<string>()
  const perSub = new Map<string, number>()

  for (const item of feed.items ?? []) {
    const link = item.link ?? ''
    if (!link || seen.has(link)) continue
    // The combined feed is ranked across all subs, so a big subreddit would
    // otherwise crowd out the small ones; PER_SUB keeps the old per-sub cap.
    const sub = link.match(/\/r\/([^/]+)\/comments\//)?.[1] ?? subs[0]
    const count = perSub.get(sub) ?? 0
    if (count >= PER_SUB) continue
    perSub.set(sub, count + 1)
    seen.add(link)

    const rawId = item.id ?? item.guid ?? link
    out.push({
      id: `reddit:${rawId.replace(/^t3_/, '')}`,
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

  return out
}
