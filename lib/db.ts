import { createClient } from '@libsql/client'
import type { Row } from '@libsql/client'
import { mkdirSync } from 'fs'
import type { RawArticle, Article, Todo, Reminder, Note, Transaction, Budget, MonthlyTotal } from './types'

const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/tech-pulse.db'
const authToken = process.env.TURSO_AUTH_TOKEN

if (url.startsWith('file:')) {
  const filePath = url.slice(5)
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '.'
  try { mkdirSync(dir, { recursive: true }) } catch {}
}

export const client = createClient({ url, authToken })

function toObj<T>(row: Row, columns: string[]): T {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < columns.length; i++) {
    const v = row[i]
    obj[columns[i]] = typeof v === 'bigint' ? Number(v) : v
  }
  return obj as T
}

let _init: Promise<void> | null = null

function ensureInit(): Promise<void> {
  if (!_init) _init = initSchema()
  return _init
}

async function initSchema(): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      subreddit TEXT,
      author TEXT,
      fetched_at TEXT NOT NULL,
      summary TEXT,
      topics TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_fetched_at ON articles(fetched_at);
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      remind_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remind_at ON reminders(remind_at);
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'debit',
      category TEXT NOT NULL DEFAULT 'Other',
      source TEXT NOT NULL DEFAULT 'manual',
      reference TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fin_date ON finance_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_fin_cat ON finance_transactions(category);
    CREATE TABLE IF NOT EXISTS finance_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(category, month)
    );
    CREATE INDEX IF NOT EXISTS idx_fin_bud_month ON finance_budgets(month);
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  // Migrations for existing DBs that predate these columns
  try {
    await client.execute(`ALTER TABLE articles ADD COLUMN topics TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* already exists */ }
  try {
    await client.execute(`ALTER TABLE articles ADD COLUMN bookmarked INTEGER NOT NULL DEFAULT 0`)
  } catch { /* already exists */ }
  try {
    await client.execute(`ALTER TABLE reminders ADD COLUMN notified_at TEXT`)
  } catch { /* already exists */ }
  try {
    await client.execute(`ALTER TABLE articles ADD COLUMN embedding TEXT`)
  } catch { /* already exists */ }
  try {
    await client.execute(`ALTER TABLE todos ADD COLUMN due_date TEXT`)
  } catch { /* already exists */ }
}

// ── Articles ───────────────────────────────────────────────────────────────

export async function upsertArticles(articles: RawArticle[]): Promise<void> {
  await ensureInit()
  if (articles.length === 0) return
  const sql = `
    INSERT INTO articles (id, source, title, url, score, comment_count, subreddit, author, fetched_at, topics)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      score = excluded.score,
      comment_count = excluded.comment_count,
      fetched_at = excluded.fetched_at,
      topics = excluded.topics
  `
  await client.batch(
    articles.map(a => ({
      sql,
      args: [a.id, a.source, a.title, a.url, a.score, a.comment_count, a.subreddit ?? null, a.author ?? null, a.fetched_at, JSON.stringify(a.topics ?? [])],
    })),
    'write'
  )
}

function toArticles(result: { rows: Row[]; columns: string[] }): Article[] {
  return result.rows.map(r => {
    const a = toObj<Article & { topics: string }>(r, result.columns)
    return { ...a, topics: JSON.parse((a.topics as string) ?? '[]') }
  })
}

export async function clearNonBookmarkedArticles(): Promise<void> {
  await ensureInit()
  await client.execute(`DELETE FROM articles WHERE bookmarked = 0`)
}

export async function setBookmark(id: string, bookmarked: boolean): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE articles SET bookmarked = ? WHERE id = ?`, args: [bookmarked ? 1 : 0, id] })
}

export async function deleteBookmark(id: string): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE articles SET bookmarked = 0 WHERE id = ?`, args: [id] })
}

export async function getBookmarkedArticles(): Promise<Article[]> {
  await ensureInit()
  const result = await client.execute(`SELECT * FROM articles WHERE bookmarked = 1 ORDER BY fetched_at DESC`)
  return toArticles(result)
}

export async function getArticles(source: string, limit: number): Promise<Article[]> {
  await ensureInit()
  const safeLimit = Math.min(limit, 200)
  const result = source === 'all'
    ? await client.execute({ sql: `SELECT * FROM articles WHERE bookmarked = 0 ORDER BY fetched_at DESC, score DESC LIMIT ?`, args: [safeLimit] })
    : await client.execute({ sql: `SELECT * FROM articles WHERE source = ? AND bookmarked = 0 ORDER BY fetched_at DESC, score DESC LIMIT ?`, args: [source, safeLimit] })
  return toArticles(result)
}

export async function getArticlesByTopics(topics: string[], source: string, limit: number): Promise<Article[]> {
  await ensureInit()
  const cap = Math.min(limit, 200)
  const placeholders = topics.map(() => '?').join(',')
  const sourceClause = source === 'all' ? '' : `AND source = ?`
  const args: (string | number)[] = [...topics]
  if (source !== 'all') args.push(source)
  args.push(cap)
  const result = await client.execute({
    sql: `
      SELECT a.* FROM articles a
      WHERE bookmarked = 0
      AND EXISTS (
        SELECT 1 FROM json_each(a.topics) je
        WHERE je.value IN (${placeholders})
      )
      ${sourceClause}
      ORDER BY fetched_at DESC, score DESC
      LIMIT ?
    `,
    args,
  })
  return toArticles(result)
}

export async function getSummary(id: string): Promise<string | null> {
  await ensureInit()
  const result = await client.execute({ sql: `SELECT summary FROM articles WHERE id = ?`, args: [id] })
  if (result.rows.length === 0) return null
  return (result.rows[0][0] as string | null) ?? null
}

export async function cacheSummary(id: string, summary: string): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE articles SET summary = ? WHERE id = ?`, args: [summary, id] })
}

export async function setArticleEmbedding(id: string, embedding: number[]): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE articles SET embedding = ? WHERE id = ?`, args: [JSON.stringify(embedding), id] })
}

export async function getArticlesForSearch(): Promise<(Article & { embedding: number[] | null })[]> {
  await ensureInit()
  const result = await client.execute(`SELECT * FROM articles WHERE bookmarked = 0 ORDER BY fetched_at DESC, score DESC`)
  return result.rows.map(r => {
    const a = toObj<Article & { topics: string; embedding: string | null }>(r, result.columns)
    return {
      ...a,
      topics: JSON.parse((a.topics as string) ?? '[]'),
      embedding: a.embedding ? JSON.parse(a.embedding) : null,
    }
  })
}

// ── Todos ──────────────────────────────────────────────────────────────────

export async function getTodos(): Promise<Todo[]> {
  await ensureInit()
  const result = await client.execute(`SELECT * FROM todos ORDER BY created_at DESC`)
  return result.rows.map(r => toObj<Todo>(r, result.columns))
}

export async function createTodo(title: string, description: string | null, priority: string, due_date?: string | null): Promise<Todo> {
  await ensureInit()
  const now = new Date().toISOString()
  const result = await client.execute({
    sql: `INSERT INTO todos (title, description, priority, due_date, done, created_at) VALUES (?, ?, ?, ?, 0, ?) RETURNING *`,
    args: [title, description, priority, due_date ?? null, now],
  })
  return toObj<Todo>(result.rows[0], result.columns)
}

export async function updateTodo(id: number, patch: { done?: number; title?: string; priority?: string; due_date?: string | null }): Promise<void> {
  await ensureInit()
  if (patch.done !== undefined) {
    await client.execute({ sql: `UPDATE todos SET done = ? WHERE id = ?`, args: [patch.done, id] })
  }
  if (patch.title !== undefined) {
    await client.execute({ sql: `UPDATE todos SET title = ? WHERE id = ?`, args: [patch.title, id] })
  }
  if (patch.priority !== undefined) {
    await client.execute({ sql: `UPDATE todos SET priority = ? WHERE id = ?`, args: [patch.priority, id] })
  }
  if (patch.due_date !== undefined) {
    await client.execute({ sql: `UPDATE todos SET due_date = ? WHERE id = ?`, args: [patch.due_date, id] })
  }
}

export async function deleteTodo(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM todos WHERE id = ?`, args: [id] })
}

// ── Reminders ──────────────────────────────────────────────────────────────

export async function getRemindersByDate(dateStr: string): Promise<Reminder[]> {
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM reminders WHERE remind_at LIKE ? ORDER BY remind_at ASC`,
    args: [`${dateStr}%`],
  })
  return result.rows.map(r => toObj<Reminder>(r, result.columns))
}

export async function getDatesWithReminders(year: number, month: number): Promise<number[]> {
  await ensureInit()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const result = await client.execute({
    sql: `SELECT DISTINCT substr(remind_at, 9, 2) as day FROM reminders WHERE remind_at LIKE ?`,
    args: [`${prefix}%`],
  })
  return result.rows.map(r => parseInt(r[0] as string, 10))
}

export async function createReminder(title: string, description: string | null, remind_at: string): Promise<Reminder> {
  await ensureInit()
  const now = new Date().toISOString()
  const result = await client.execute({
    sql: `INSERT INTO reminders (title, description, remind_at, created_at) VALUES (?, ?, ?, ?) RETURNING *`,
    args: [title, description, remind_at, now],
  })
  return toObj<Reminder>(result.rows[0], result.columns)
}

export async function deleteReminder(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM reminders WHERE id = ?`, args: [id] })
}

export async function getDueReminders(windowMinutes = 2): Promise<Reminder[]> {
  await ensureInit()
  const now = new Date().toISOString()
  const past = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const result = await client.execute({
    sql: `SELECT * FROM reminders WHERE remind_at > ? AND remind_at <= ? AND (notified_at IS NULL)`,
    args: [past, now],
  })
  return result.rows.map(r => toObj<Reminder>(r, result.columns))
}

export async function markReminderNotified(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE reminders SET notified_at = ? WHERE id = ?`, args: [new Date().toISOString(), id] })
}

// ── Push subscriptions ─────────────────────────────────────────────────────

export async function savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
  await ensureInit()
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [endpoint, p256dh, auth, now],
  })
}

export async function getPushSubscriptions(): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  await ensureInit()
  const result = await client.execute(`SELECT endpoint, p256dh, auth FROM push_subscriptions`)
  return result.rows.map(r => toObj(r, result.columns)) as { endpoint: string; p256dh: string; auth: string }[]
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM push_subscriptions WHERE endpoint = ?`, args: [endpoint] })
}

// ── Notes ──────────────────────────────────────────────────────────────────

export async function getNotes(): Promise<Note[]> {
  await ensureInit()
  const result = await client.execute(`SELECT * FROM notes ORDER BY updated_at DESC`)
  return result.rows.map(r => toObj<Note>(r, result.columns))
}

export async function getNote(id: number): Promise<Note | null> {
  await ensureInit()
  const result = await client.execute({ sql: `SELECT * FROM notes WHERE id = ?`, args: [id] })
  if (result.rows.length === 0) return null
  return toObj<Note>(result.rows[0], result.columns)
}

export async function createNote(title: string, content: string): Promise<Note> {
  await ensureInit()
  const now = new Date().toISOString()
  const result = await client.execute({
    sql: `INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING *`,
    args: [title, content, now, now],
  })
  return toObj<Note>(result.rows[0], result.columns)
}

export async function updateNote(id: number, patch: { title?: string; content?: string }): Promise<void> {
  await ensureInit()
  const now = new Date().toISOString()
  if (patch.title !== undefined && patch.content !== undefined) {
    await client.execute({ sql: `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?`, args: [patch.title, patch.content, now, id] })
  } else if (patch.title !== undefined) {
    await client.execute({ sql: `UPDATE notes SET title = ?, updated_at = ? WHERE id = ?`, args: [patch.title, now, id] })
  } else if (patch.content !== undefined) {
    await client.execute({ sql: `UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`, args: [patch.content, now, id] })
  }
}

export async function deleteNote(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM notes WHERE id = ?`, args: [id] })
}

// ── Finance ────────────────────────────────────────────────────────────────

export const FINANCE_CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Utilities',
  'Entertainment', 'Healthcare', 'Finance', 'Education', 'Transfers', 'Other',
] as const

const CAT_KEYWORDS: [string, string[]][] = [
  ['Food & Dining', ['swiggy', 'zomato', 'dominos', 'mcdonald', 'pizza', 'restaurant', 'cafe', 'blinkit', 'dunzo', 'zepto', 'bigbasket', 'grofers', 'kfc', 'burger king', 'subway', 'haldiram', 'dineout']],
  ['Transport', ['ola', 'uber', 'rapido', 'metro', 'irctc', 'redbus', 'makemytrip', 'goibibo', 'fuel', 'petrol', 'diesel', 'bounce', 'yulu', 'railway', 'flight', 'bus ticket', 'cab']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal', 'reliance', 'tata cliq', 'croma', 'decathlon', 'ikea']],
  ['Utilities', ['airtel', 'jio', 'bsnl', 'vodafone', 'electricity', 'bescom', 'tata power', 'water bill', 'gas bill', 'recharge', 'bill payment', 'dth', 'tata sky', 'internet', 'broadband']],
  ['Entertainment', ['netflix', 'spotify', 'amazon prime', 'hotstar', 'disney', 'bookmyshow', 'pvr', 'inox', 'zee5', 'gaana', 'steam', 'playstation']],
  ['Healthcare', ['pharmacy', 'hospital', 'clinic', 'doctor', 'apollo', 'medplus', 'pharmeasy', '1mg', 'netmeds', 'fortis', 'chemist', 'medical', 'medibuddy']],
  ['Finance', ['insurance', ' emi', 'loan', ' sip', 'mutual fund', 'policy', 'premium', 'lic', 'ppf', 'fixed deposit', 'bajaj finserv']],
  ['Education', ['course', 'udemy', 'coursera', 'byju', 'unacademy', 'vedantu', 'upgrad', 'college', 'tuition', 'books']],
  ['Transfers', ['transfer', 'neft', 'imps', 'rtgs', 'sent to', 'received from', 'cashback', 'refund', 'upi']],
]

export function autoCategory(description: string): string {
  const lower = description.toLowerCase()
  for (const [cat, keywords] of CAT_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return cat
  }
  return 'Other'
}

export async function getTransactions(
  filters: { month?: string; category?: string; type?: string; q?: string }
): Promise<Transaction[]> {
  await ensureInit()
  let sql = `SELECT * FROM finance_transactions WHERE 1=1`
  const args: (string | number)[] = []
  if (filters.month)    { sql += ` AND date LIKE ?`;         args.push(`${filters.month}%`) }
  if (filters.category) { sql += ` AND category = ?`;        args.push(filters.category) }
  if (filters.type)     { sql += ` AND type = ?`;            args.push(filters.type) }
  if (filters.q)        { sql += ` AND description LIKE ?`;  args.push(`%${filters.q}%`) }
  sql += ` ORDER BY date DESC, created_at DESC`
  const result = await client.execute({ sql, args })
  return result.rows.map(r => toObj<Transaction>(r, result.columns))
}

export async function getTransactionSummary(month: string) {
  await ensureInit()
  const totalsResult = await client.execute({
    sql: `
      SELECT
        COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
        COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit,
        COUNT(*) as count
      FROM finance_transactions WHERE date LIKE ?
    `,
    args: [`${month}%`],
  })
  const totals = toObj<{ credit: number; debit: number; count: number }>(totalsResult.rows[0], totalsResult.columns)
  const catResult = await client.execute({
    sql: `
      SELECT category, SUM(amount) as amount
      FROM finance_transactions WHERE date LIKE ? AND type='debit'
      GROUP BY category ORDER BY amount DESC
    `,
    args: [`${month}%`],
  })
  const by_category = catResult.rows.map(r => toObj<{ category: string; amount: number }>(r, catResult.columns))
  return { ...totals, by_category }
}

export async function createTransaction(
  data: { date: string; description: string; amount: number; type: string; category: string; source: string; reference?: string | null }
): Promise<Transaction> {
  await ensureInit()
  const now = new Date().toISOString()
  const result = await client.execute({
    sql: `INSERT INTO finance_transactions (date, description, amount, type, category, source, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [data.date, data.description, data.amount, data.type, data.category, data.source, data.reference ?? null, now],
  })
  return toObj<Transaction>(result.rows[0], result.columns)
}

export async function importTransactions(
  rows: { date: string; description: string; amount: number; type: string; category: string; source: string }[]
): Promise<number> {
  await ensureInit()
  const now = new Date().toISOString()
  if (rows.length === 0) return 0
  await client.batch(
    rows.map(r => ({
      sql: `INSERT INTO finance_transactions (date, description, amount, type, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [r.date, r.description, r.amount, r.type, r.category, r.source, now],
    })),
    'write'
  )
  return rows.length
}

export async function deleteTransaction(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM finance_transactions WHERE id = ?`, args: [id] })
}

export async function getImportSources(): Promise<{ source: string; count: number; min_date: string; max_date: string }[]> {
  await ensureInit()
  const result = await client.execute(`
    SELECT source, COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date
    FROM finance_transactions
    GROUP BY source
    ORDER BY MAX(created_at) DESC
  `)
  return result.rows.map(r => toObj(r, result.columns)) as { source: string; count: number; min_date: string; max_date: string }[]
}

export async function deleteTransactionsBySource(source: string): Promise<number> {
  await ensureInit()
  const result = await client.execute({ sql: `DELETE FROM finance_transactions WHERE source = ?`, args: [source] })
  return Number(result.rowsAffected)
}

export async function getBudgets(month: string): Promise<Budget[]> {
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM finance_budgets WHERE month = ? ORDER BY category`,
    args: [month],
  })
  return result.rows.map(r => toObj<Budget>(r, result.columns))
}

export async function upsertBudget(category: string, amount: number, month: string): Promise<Budget> {
  await ensureInit()
  const now = new Date().toISOString()
  const result = await client.execute({
    sql: `INSERT INTO finance_budgets (category, amount, month, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(category, month) DO UPDATE SET amount = excluded.amount
          RETURNING *`,
    args: [category, amount, month, now],
  })
  return toObj<Budget>(result.rows[0], result.columns)
}

export async function deleteBudget(id: number): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `DELETE FROM finance_budgets WHERE id = ?`, args: [id] })
}

export async function getMonthlyTotals(numMonths: number): Promise<MonthlyTotal[]> {
  await ensureInit()
  const result = await client.execute({
    sql: `
      SELECT substr(date,1,7) as month,
        COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
        COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit
      FROM finance_transactions
      GROUP BY substr(date,1,7) ORDER BY month DESC LIMIT ?
    `,
    args: [numMonths],
  })
  return result.rows.map(r => toObj<MonthlyTotal>(r, result.columns)).reverse()
}
