import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { fetchHackerNews } from '../lib/fetchers/hackernews'
import { fetchReddit } from '../lib/fetchers/reddit'
import { fetchDevto } from '../lib/fetchers/devto'
import { fetchMedium } from '../lib/fetchers/medium'
import { fetchHuggingFace } from '../lib/fetchers/huggingface'
import { fetchArxiv } from '../lib/fetchers/arxiv'
import { fetchLobsters } from '../lib/fetchers/lobsters'
import { fetchPragmatic } from '../lib/fetchers/pragmatic'
import { fetchSimonWillison } from '../lib/fetchers/simonwillison'
import { fetchGithubBlog } from '../lib/fetchers/githubblog'
// Via the facade, NOT lib/db. This file is not CLI-only: /api/refresh imports
// runFetch, so it runs on the request path. Importing lib/db there pulls in
// @libsql/client, whose native binary is built for darwin and cannot load on
// AppSail's Linux runtime — which made article refresh fail outright.
import { upsertArticles, clearNonBookmarkedArticles, setArticleEmbedding } from '../lib/data'
import { classifyArticles, type Classification } from '../lib/classifier'
import { generateEmbeddings } from '../lib/embeddings'
import { platformAIConfigured } from '../lib/platform-ai'
import { SOURCES, resolveTags, type Source } from '../lib/source-registry'
import type { RawArticle, FeedPrefs } from '../lib/types'

interface FetchResult {
  total: number
  failed: string[]
  /**
   * Articles fetched but dropped for not matching the tenant's topics.
   *
   * Surfaced so a narrow subscription returning 9 of 142 articles reads as
   * "working as configured" rather than as a broken fetch — the two are
   * otherwise indistinguishable from the UI.
   */
  filtered: number
  /**
   * How classification went. Surfaced all the way to the Refresh button because
   * a silently degraded classifier is indistinguishable from a working one that
   * found nothing — which is exactly how every article ended up dimmed as
   * "off-topic" on a deployment that could not reach the model host.
   */
  classifier: {
    mode: 'llm' | 'partial' | 'keyword'
    backend: 'platformai' | 'openai' | 'none'
    /** Articles an LLM gave a verdict on; the rest are keyword-derived. */
    classified: number
    note?: string
  }
}

/**
 * Each source's fetcher, taking the one argument its tier needs.
 *
 * Native-tier fetchers receive the tags resolved from the tenant's enabled
 * topics; keyword-tier fetchers that pre-filter titles (HN, Lobsters) receive
 * the enabled topics themselves. The remaining keyword sources publish a single
 * general feed with nothing to narrow, so they ignore the argument and rely on
 * the post-classification filter below.
 */
const FETCHERS: Record<Source, (arg: string[]) => Promise<RawArticle[]>> = {
  hn:            topics => fetchHackerNews(topics),
  reddit:        subs   => fetchReddit(subs),
  devto:         tags   => fetchDevto(tags),
  medium:        tags   => fetchMedium(tags),
  huggingface:   ()     => fetchHuggingFace(),
  arxiv:         feeds  => fetchArxiv(feeds),
  lobsters:      topics => fetchLobsters(topics),
  pragmatic:     ()     => fetchPragmatic(),
  simonwillison: ()     => fetchSimonWillison(),
  githubblog:    ()     => fetchGithubBlog(),
}

/**
 * Drops articles that missed the tenant's topics — the actual guarantee behind
 * "only my topics get fetched", since native tag mappings are best-effort and
 * several sources have no topic API at all.
 *
 * CONDITIONAL ON CLASSIFIER HEALTH, and that is the whole subtlety. Commit
 * 931395f fixed a bug where an unreachable model host made every article look
 * off-topic; filtering unconditionally would reintroduce it far worse, turning
 * dimmed articles into deleted ones and leaving a tenant with an empty feed and
 * no explanation. So:
 *
 *   keyword / no backend — filter nothing. Accuracy degrades, availability does
 *                          not. The UI keeps dimming off-topic items as before.
 *   partial             — filter only articles an LLM actually answered for; a
 *                          keyword-derived guess is not trustworthy enough to
 *                          delete on.
 *   llm                 — filter everything.
 */
function filterToTopics(
  articles: RawArticle[],
  enabledTopics: string[],
  classification: Classification,
): RawArticle[] {
  if (classification.mode === 'keyword' || classification.backend === 'none') return articles

  const wanted = new Set(enabledTopics)
  return articles.filter(a => {
    if (classification.mode === 'partial' && !classification.llmVerdicts.has(a.id)) return true
    return (a.topics ?? []).some(t => wanted.has(t))
  })
}

/**
 * Fetches, classifies and stores one tenant's feed.
 *
 * Preferences are passed in rather than loaded here so the caller owns the
 * failure mode: POST /api/refresh fails closed on an unreadable preference row
 * instead of silently fetching the whole catalogue, and tests can drive the
 * pipeline without a database.
 */
export async function runFetch({ userId, sources, topics }: FeedPrefs & { userId: string }): Promise<FetchResult> {
  // Registry order, not the caller's, so a refresh is reproducible and the
  // section order in the UI is stable across runs.
  const enabled = (Object.keys(FETCHERS) as Source[]).filter(s => sources.includes(s))

  const results = await Promise.allSettled(
    enabled.map(s => FETCHERS[s](SOURCES[s].tier === 'native' ? resolveTags(s, topics) : topics)),
  )
  const failed: string[] = []
  const allArticles: RawArticle[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const name = SOURCES[enabled[i]].label
    if (result.status === 'fulfilled') {
      console.log(`[${name}] ${result.value.length} articles`)
      allArticles.push(...result.value)
    } else {
      console.error(`[${name}] FAILED:`, result.reason?.message ?? result.reason)
      failed.push(name)
    }
  }

  // Classified against every topic, not just the enabled ones, so topic labels
  // stay accurate and changing a subscription re-filters without a refetch.
  const classification = await classifyArticles(allArticles.map(a => ({ id: a.id, title: a.title })))
  for (const article of allArticles) {
    article.topics = classification.topics.get(article.id) ?? []
    article.relevance = article.topics.length   // more matched interest topics = more relevant
  }
  console.log(`[classifier] backend=${classification.backend} mode=${classification.mode} llm-verdicts=${classification.llmVerdicts.size}/${allArticles.length}`)
  if (classification.note) console.warn(`[classifier] ${classification.note}`)

  const kept = filterToTopics(allArticles, topics, classification)
  const filtered = allArticles.length - kept.length
  if (filtered > 0) console.log(`[filter] dropped ${filtered} off-topic of ${allArticles.length}`)

  // Only this tenant's rows are replaced.
  //
  // The guard is "did any source answer", NOT "did we keep anything". A narrow
  // subscription can legitimately match zero articles, and that has to be able
  // to empty the feed — gating the clear on kept.length would leave rows from a
  // previous, broader subscription sitting there looking current. But a run
  // where EVERY source failed is a network problem, not an empty result, so it
  // keeps the previous feed rather than blanking it.
  if (enabled.length > 0 && failed.length < enabled.length) {
    await clearNonBookmarkedArticles(userId)
    if (kept.length > 0) {
      await upsertArticles(userId, kept)

      // Fire-and-forget: embeddings are nice-to-have for search, don't block the response
      if (platformAIConfigured()) {
        embedArticles(kept).catch(err => console.error('[embeddings] failed:', err))
      }
    }
  }

  return {
    total: kept.length,
    failed,
    filtered,
    classifier: {
      mode: classification.mode,
      backend: classification.backend,
      classified: classification.llmVerdicts.size,
      ...(classification.note ? { note: classification.note } : {}),
    },
  }
}

async function embedArticles(articles: RawArticle[]): Promise<void> {
  const EMBED_BATCH = 20
  for (let i = 0; i < articles.length; i += EMBED_BATCH) {
    const batch = articles.slice(i, i + EMBED_BATCH)
    const vectors = await generateEmbeddings(batch.map(a => a.title))
    await Promise.all(batch.map((a, j) => vectors[j]?.length ? setArticleEmbedding(a.id, vectors[j]) : null))
    console.log(`[embeddings] ${Math.min(i + EMBED_BATCH, articles.length)}/${articles.length}`)
  }
}

// Run when executed directly — works with both Bun (import.meta.main) and tsx (argv check)
const isMain = (import.meta as { main?: boolean }).main ??
  process.argv[1]?.endsWith('fetch.ts') ??
  process.argv[1]?.endsWith('fetch.js')
if (isMain) {
  // A refresh is per-tenant now, so the CLI needs to be told whose feed to
  // build. There is deliberately no "all tenants" mode: scheduled refresh was
  // dropped in favour of on-demand, and a loop here would quietly reinstate it.
  const emailFlag = process.argv.indexOf('--user')
  const email = emailFlag !== -1 ? process.argv[emailFlag + 1] : undefined
  if (!email) {
    console.error('Usage: bun scripts/fetch.ts --user <email>')
    process.exit(1)
  }

  // Imported lazily: this branch only runs from a terminal, and the facade pulls
  // in the Turso driver when a domain is not on Catalyst.
  ;(async () => {
    const { findUserByEmail, getFeedPrefs } = await import('../lib/data')
    const user = await findUserByEmail(email.trim().toLowerCase())
    if (!user) {
      console.error(`No such user: ${email}`)
      process.exit(1)
    }
    const prefs = await getFeedPrefs(user.id)
    console.log(`[${new Date().toISOString()}] Starting fetch for ${email}...`)
    console.log(`  sources: ${prefs.sources.join(', ')}`)
    console.log(`  topics:  ${prefs.topics.join(', ')}`)

    const { total, failed, filtered, classifier } = await runFetch({ userId: user.id, ...prefs })
    console.log(`Done. Stored: ${total} articles (${filtered} filtered out). Classifier: ${classifier.mode} (${classifier.backend}).`)
    if (failed.length) console.warn(`Failed sources: ${failed.join(', ')}`)
  })().catch(console.error)
}
