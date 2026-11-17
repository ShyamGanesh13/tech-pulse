import { getArticlesForSearch } from '@/lib/data'
import { generateEmbeddings, cosineSimilarity } from '@/lib/embeddings'
import { platformAIConfigured } from '@/lib/platform-ai'
import type { Article } from '@/lib/types'

type Hit = Article & { embedding: number[] | null; score?: number }

function keywordMatch(articles: Hit[], q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/)
  return articles.filter(a => terms.some(t => a.title.toLowerCase().includes(t))).slice(0, 20)
}

/** Semantic search over a tenant's feed, falling back to title keywords. Shared by
 *  GET /api/articles/search and Urai's feed tool. */
export async function searchArticles(userId: string, q: string): Promise<{ articles: Hit[]; mode: 'semantic' | 'keyword' }> {
  const articles = await getArticlesForSearch(userId)
  const withEmbeddings = articles.filter(a => a.embedding && a.embedding.length > 0)
  if (!platformAIConfigured() || withEmbeddings.length === 0) {
    return { articles: keywordMatch(articles, q), mode: 'keyword' }
  }
  try {
    const [queryVec] = await generateEmbeddings([q], 'search_query')
    if (!queryVec?.length) throw new Error('empty query embedding')
    const scored = withEmbeddings.map(a => ({ ...a, score: cosineSimilarity(queryVec, a.embedding!) }))
    scored.sort((a, b) => b.score - a.score)
    return { articles: scored.filter(a => a.score > 0.3).slice(0, 20), mode: 'semantic' }
  } catch (err) {
    console.error('[search] embedding failed, falling back:', err)
    return { articles: keywordMatch(articles, q), mode: 'keyword' }
  }
}
