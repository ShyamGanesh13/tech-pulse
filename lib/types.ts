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
  due_date: string | null
  created_at: string
}

export interface Reminder {
  id: number
  title: string
  description: string | null
  remind_at: string
  created_at: string
}

export interface Note {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  date: string           // YYYY-MM-DD
  description: string
  amount: number         // always positive
  type: 'credit' | 'debit'
  category: string
  source: string         // 'gpay' | 'paytm' | 'manual'
  reference: string | null
  created_at: string
}

export interface Budget {
  id: number
  category: string
  amount: number
  month: string          // YYYY-MM
  created_at: string
}

export interface MonthlyTotal {
  month: string
  credit: number
  debit: number
}
