export type Source = 'hn' | 'reddit' | 'devto' | 'medium' | 'huggingface' | 'arxiv' | 'lobsters' | 'pragmatic'

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

export interface Todo {
  id: number
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  done: number
  created_at: string
}

export interface Reminder {
  id: number
  title: string
  description: string | null
  remind_at: string
  created_at: string
}
