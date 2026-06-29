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
import { upsertArticles } from '../lib/db'
// import { classifyArticles } from '../lib/classifier'
import type { RawArticle } from '../lib/types'

interface FetchResult {
  total: number
  failed: string[]
}

export async function runFetch(dbPath?: string): Promise<FetchResult> {
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

  // const topicsMap = await classifyArticles(allArticles.map(a => ({ id: a.id, title: a.title })))

  if (allArticles.length > 0) {
    upsertArticles(allArticles, dbPath)
  }

  return { total: allArticles.length, failed }
}

// Run when executed directly — works with both Bun (import.meta.main) and tsx (argv check)
const isMain = (import.meta as { main?: boolean }).main ??
  process.argv[1]?.endsWith('fetch.ts') ??
  process.argv[1]?.endsWith('fetch.js')
if (isMain) {
  console.log(`[${new Date().toISOString()}] Starting fetch...`)
  runFetch()
    .then(({ total, failed }) => {
      console.log(`Done. Total: ${total} articles.`)
      if (failed.length) console.warn(`Failed sources: ${failed.join(', ')}`)
    })
    .catch(console.error)
}
