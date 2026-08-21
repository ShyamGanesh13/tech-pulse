export type Source = 'hn' | 'reddit' | 'devto' | 'medium' | 'huggingface' | 'arxiv' | 'lobsters' | 'pragmatic' | 'simonwillison' | 'githubblog'

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
  relevance?: number   // count of matched interest topics; higher = more relevant
}

export interface Article extends RawArticle {
  summary: string | null
  // Derived per-caller from user_articles via LEFT JOIN — NOT a stored column
  // on articles. articles is global content; bookmarking is per-user state.
  bookmarked?: number
}

export interface Todo {
  user_id: string
  id: string   // uuid we generate — see Note.id for why
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  done: number
  due_date: string | null
  completed_at: string | null
  created_at: string
}

export interface Nyabagam {
  user_id: string
  id: string   // uuid we generate — see Note.id for why
  title: string
  description: string | null
  remind_at: string
  created_at: string
}

export interface Note {
  user_id: string
  // A uuid we generate, NOT a database-assigned integer. Catalyst ROWIDs are 17
  // digits and cannot round-trip through a JS number (the row API returns them as
  // raw JSON numbers, which JSON.parse rounds). Owning the id ourselves keeps it
  // identical on both backends and lets an insert return without a re-read.
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  user_id: string
  id: string   // uuid we generate — see Note.id for why
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
  user_id: string
  id: string   // uuid we generate — see Note.id for why
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

// ── Urai (chat) ──────────────────────────────────────────────────────────────

export interface UraiConversation {
  user_id: string
  id: string   // uuid we generate — see Note.id for why
  title: string
  created_at: string
  updated_at: string
}

export interface UraiSource {
  title: string
  url: string
}

export interface UraiMessage {
  user_id: string
  id: string              // uuid we generate
  conversation_id: string // the conversation's uuid, NOT a Catalyst ROWID/FK
  role: 'user' | 'assistant'
  content: string
  sources: UraiSource[] | null
  created_at: string
}

// ── Vault (zero-knowledge) ───────────────────────────────────────────────────
export interface VaultMetaRow {
  user_id: string
  kdf_salt: string
  kdf_iterations: number
  wrapped_dek: string
  created_at: string
}
export interface VaultItemRow {
  user_id: string
  id: string
  iv: string
  ciphertext: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface VaultFolderRow {
  user_id: string
  id: string
  parent_id: string | null
  iv: string
  name_ct: string
  sort_order: number
  created_at: string
  deleted_at: string | null
}

export interface User {
  id: string
  email: string
  firebase_uid: string | null
  name: string | null
  picture: string | null
  created_at: string
  last_login_at: string
}
