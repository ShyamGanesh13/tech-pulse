import { platformAIEmbed, platformAIConfigured } from './platform-ai'
import { titleTokens } from './story-groups'

export async function generateEmbeddings(texts: string[], prefix: 'search_document' | 'search_query' = 'search_document'): Promise<number[][]> {
  if (!platformAIConfigured() || texts.length === 0) return texts.map(() => [])
  const taskType = prefix === 'search_query' ? 'retrieval_query' : 'retrieval_document'
  return platformAIEmbed(texts, taskType)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Untuned: PlatformAI is not reachable from a dev machine, so this was never
 * measured on real bge-m3 title vectors. Deliberately high — a false merge
 * hides a story, a missed one only shows a duplicate. Tune against live pairs.
 */
export const STORY_SIMILARITY_MIN = 0.85
/** Unrelated titles can still embed close; a similar pair must also share this many title tokens. */
const SIMILAR_MIN_SHARED_TOKENS = 2

/**
 * Cross-source article pairs whose title embeddings say "same story", as
 * id -> ids. Feeds `sim` on the feed response so groupStories can match pairs
 * the title-word rule misses, without shipping vectors to the browser.
 * Articles with no vector simply never appear.
 */
export function similarStories(
  articles: { id: string; source: string; title: string }[],
  vectors: Map<string, number[]>,
  skipSources: ReadonlySet<string> = new Set(),
): Map<string, string[]> {
  const items = articles
    .filter(a => !skipSources.has(a.source) && vectors.get(a.id)?.length)
    .map(a => ({ a, v: vectors.get(a.id)!, t: new Set(titleTokens(a.title)) }))
  const out = new Map<string, string[]>()
  const link = (x: string, y: string) => { out.set(x, [...(out.get(x) ?? []), y]) }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i], y = items[j]
      if (x.a.source === y.a.source || x.v.length !== y.v.length) continue
      let shared = 0
      for (const t of x.t) if (y.t.has(t)) shared++
      if (shared < SIMILAR_MIN_SHARED_TOKENS) continue
      if (cosineSimilarity(x.v, y.v) < STORY_SIMILARITY_MIN) continue
      link(x.a.id, y.a.id); link(y.a.id, x.a.id)
    }
  }
  return out
}
