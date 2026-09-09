import { NextRequest, NextResponse } from 'next/server'
import { getArticles, getArticlesByTopics, getFeedPrefs } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { isSource } from '@/lib/source-registry'
import type { Article } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * WHY READS ARE PREFERENCE-FILTERED TOO, not just the fetch.
 *
 * Turning a source off would otherwise only take effect on the tenant's NEXT
 * refresh: the rows pulled under the old subscription stay in their table and
 * keep appearing, so the setting looks broken. Intersecting here makes disabling
 * something immediate, and makes the `source=all` case mean "everything I am
 * subscribed to" rather than literally every row present.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const source = url.searchParams.get('source') ?? 'all'
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const topicsParam = url.searchParams.get('topics')
  const requestedTopics = topicsParam
    ? topicsParam.split(',').map(t => t.trim()).filter(Boolean)
    : []

  // Validated against the registry rather than a hand-maintained array that
  // used to sit here and drift every time a source was added.
  if (source !== 'all' && !isSource(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const safeLimit = isNaN(limit) ? 100 : limit
  const prefs = await getFeedPrefs(userId)
  const subscribed = new Set<string>(prefs.sources)

  // Asked for a source they have switched off: an empty feed is the honest
  // answer, and cheaper than a query.
  if (source !== 'all' && !subscribed.has(source)) {
    return NextResponse.json({ articles: [] })
  }

  if (requestedTopics.length > 0) {
    // An explicit topic filter is a deliberate narrowing, so it is applied
    // strictly — but still only within what the tenant subscribes to.
    const topics = requestedTopics.filter(t => prefs.topics.includes(t))
    if (topics.length === 0) return NextResponse.json({ articles: [] })
    const articles = await getArticlesByTopics(userId, topics, source, safeLimit)
    return NextResponse.json({ articles: articles.filter(a => subscribed.has(a.source)) })
  }

  const articles = await getArticles(userId, source, safeLimit)
  return NextResponse.json({ articles: articles.filter(a => keep(a, subscribed, prefs.topics)) })
}

/**
 * The unfiltered view: subscribed source, and either a subscribed topic or no
 * topics at all.
 *
 * THE UNTAGGED ALLOWANCE IS NOT AN OVERSIGHT. When the classifier is degraded,
 * scripts/fetch.ts deliberately keeps articles it could not tag rather than
 * deleting them (the fix in commit 931395f), and the UI dims them as off-topic.
 * Dropping untagged articles here would undo that at read time and hand the
 * tenant an empty feed during a model-host outage — the exact failure that fix
 * was for. Tagged articles still disappear the moment their topic is switched
 * off, which is what "in sync with preferences" has to mean in practice.
 */
function keep(article: Article, subscribed: Set<string>, topics: string[]): boolean {
  if (!subscribed.has(article.source)) return false
  const tags = article.topics ?? []
  if (tags.length === 0) return true
  return tags.some(t => topics.includes(t))
}
