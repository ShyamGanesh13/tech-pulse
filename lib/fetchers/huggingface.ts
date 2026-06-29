import type { RawArticle } from '../types'

interface HFPaper {
  paper: {
    id: string
    authors: { name: string }[]
    upvotes: number
  }
  title: string
  numComments: number
  publishedAt: string
}

export async function fetchHuggingFace(): Promise<RawArticle[]> {
  const res = await fetch('https://huggingface.co/api/daily_papers?limit=20', {
    headers: { 'User-Agent': 'tech-pulse/1.0' },
  })
  const papers: HFPaper[] = await res.json()
  const now = new Date().toISOString()
  return papers.filter(p => p?.title && p?.paper?.id).map(p => ({
    id: `huggingface:${p.paper.id}`,
    source: 'huggingface' as const,
    title: p.title,
    url: `https://huggingface.co/papers/${p.paper.id}`,
    score: p.paper.upvotes ?? 0,
    comment_count: p.numComments ?? 0,
    subreddit: null,
    author: p.paper?.authors?.[0]?.name ?? null,
    fetched_at: now,
    topics: [],
  }))
}
