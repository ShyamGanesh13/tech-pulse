import { fetchHackerNews } from '../lib/fetchers/hackernews'
import { fetchReddit } from '../lib/fetchers/reddit'
import { fetchDevto } from '../lib/fetchers/devto'
import { fetchMedium } from '../lib/fetchers/medium'
import { upsertArticles } from '../lib/db'
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
  ]

  const results = await Promise.allSettled(sources.map(s => s.fn()))
  const failed: string[] = []
  let total = 0

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const name = sources[i].name
    if (result.status === 'fulfilled') {
      if (result.value.length > 0) {
        upsertArticles(result.value, dbPath)
      }
      console.log(`[${name}] ${result.value.length} articles`)
      total += result.value.length
    } else {
      console.error(`[${name}] FAILED:`, result.reason?.message ?? result.reason)
      failed.push(name)
    }
  }

  return { total, failed }
}

// Run when executed directly (not imported)
if (import.meta.main) {
  console.log(`[${new Date().toISOString()}] Starting fetch...`)
  runFetch()
    .then(({ total, failed }) => {
      console.log(`Done. Total: ${total} articles.`)
      if (failed.length) console.warn(`Failed sources: ${failed.join(', ')}`)
    })
    .catch(console.error)
}
