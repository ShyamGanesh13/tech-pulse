import { NextRequest, NextResponse } from 'next/server'
import { getArticlesForSearch } from '@/lib/db'
import { generateEmbeddings, cosineSimilarity } from '@/lib/embeddings'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ articles: [] })

  const articles = await getArticlesForSearch()

  // Articles that already have embeddings
  const withEmbeddings = articles.filter(a => a.embedding && a.embedding.length > 0)

  if (!process.env.OLLAMA_HOST || withEmbeddings.length === 0) {
    // Fallback: simple case-insensitive keyword search
    const terms = q.toLowerCase().split(/\s+/)
    const matches = articles.filter(a =>
      terms.some(t => a.title.toLowerCase().includes(t))
    )
    return NextResponse.json({ articles: matches.slice(0, 20), mode: 'keyword' })
  }

  try {
    const [queryVec] = await generateEmbeddings([q])
    if (!queryVec?.length) throw new Error('empty query embedding')

    const scored = withEmbeddings.map(a => ({
      ...a,
      score: cosineSimilarity(queryVec, a.embedding!),
    }))

    scored.sort((a, b) => b.score - a.score)
    const top = scored.filter(a => a.score > 0.3).slice(0, 20)

    return NextResponse.json({ articles: top, mode: 'semantic' })
  } catch (err) {
    console.error('[search] embedding failed, falling back:', err)
    const terms = q.toLowerCase().split(/\s+/)
    const matches = articles.filter(a =>
      terms.some(t => a.title.toLowerCase().includes(t))
    )
    return NextResponse.json({ articles: matches.slice(0, 20), mode: 'keyword' })
  }
}
