export type Source = 'hn' | 'reddit' | 'devto' | 'medium'

export interface RawArticle {
  id: string
  source: Source
  title: string
  url: string
  score: number
  comment_count: number
  subreddit: string | null
  author: string | null
  fetched_at: string
  topics: string[]
}

export interface Article extends RawArticle {
  summary: string | null
}
