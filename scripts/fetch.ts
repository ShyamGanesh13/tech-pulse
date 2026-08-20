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
// Via the facade, NOT lib/db. This file is not CLI-only: /api/refresh imports
// runFetch, so it runs on the request path. Importing lib/db there pulls in
// @libsql/client, whose native binary is built for darwin and cannot load on
// AppSail's Linux runtime — which made article refresh fail outright.
import { upsertArticles, clearNonBookmarkedArticles, setArticleEmbedding } from '../lib/data'
import { classifyArticles } from '../lib/classifier'
import { generateEmbeddings } from '../lib/embeddings'
import { platformAIConfigured } from '../lib/platform-ai'
import type { RawArticle } from '../lib/types'

interface FetchResult {
  total: number
  failed: string[]
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

export async function runFetch(): Promise<FetchResult> {
  const sources = [
    { name: 'HN', fn: fetchHackerNews },
    { name: 'Reddit', fn: fetchReddit },
    { name: 'Dev.to', fn: fetchDevto },
    { name: 'Medium', fn: fetchMedium },
    { name: 'HuggingFace', fn: fetchHuggingFace },
    { name: 'arXiv', fn: fetchArxiv },
    { name: 'Lobsters', fn: fetchLobsters },
    { name: 'Pragmatic', fn: fetchPragmatic },
  ]

  const results = await Promise.allSettled(sources.map(s => s.fn()))
  const failed: string[] = []

  const allArticles: RawArticle[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const name = sources[i].name
    if (result.status === 'fulfilled') {
      console.log(`[${name}] ${result.value.length} articles`)
      allArticles.push(...result.value)
    } else {
      console.error(`[${name}] FAILED:`, result.reason?.message ?? result.reason)
      failed.push(name)
    }
  }

  const classification = await classifyArticles(allArticles.map(a => ({ id: a.id, title: a.title })))
  for (const article of allArticles) {
    article.topics = classification.topics.get(article.id) ?? []
    article.relevance = article.topics.length   // more matched interest topics = more relevant
  }
  console.log(`[classifier] backend=${classification.backend} mode=${classification.mode} llm-verdicts=${classification.llmVerdicts.size}/${allArticles.length}`)
  if (classification.note) console.warn(`[classifier] ${classification.note}`)

  if (allArticles.length > 0) {
    await clearNonBookmarkedArticles()
    await upsertArticles(allArticles)

    // Fire-and-forget: embeddings are nice-to-have for search, don't block the response
    if (platformAIConfigured()) {
      embedArticles(allArticles).catch(err => console.error('[embeddings] failed:', err))
    }
  }

  return {
    total: allArticles.length,
    failed,
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
  console.log(`[${new Date().toISOString()}] Starting fetch...`)
  runFetch()
    .then(({ total, failed, classifier }) => {
      console.log(`Done. Total: ${total} articles. Classifier: ${classifier.mode} (${classifier.backend}).`)
      if (failed.length) console.warn(`Failed sources: ${failed.join(', ')}`)
    })
    .catch(console.error)
}
