import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import type { RawArticle, Article, Todo, Reminder, Note, Transaction, Budget, MonthlyTotal } from './types'

const DEFAULT_DB_PATH = `${process.cwd()}/data/tech-pulse.db`
const instances = new Map<string, Database.Database>()

export function getDb(path = DEFAULT_DB_PATH): Database.Database {
  if (instances.has(path)) {
    // If the file was deleted (e.g. in tests), close and recreate
    if (process.env.NODE_ENV !== 'test' || existsSync(path)) return instances.get(path)!
    instances.get(path)!.close()
    instances.delete(path)
  }
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.exec(`
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
  `)
  db.exec(`
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
  `)
  // Add topics column to existing DBs that don't have it yet
  try {
    db.exec(`ALTER TABLE articles ADD COLUMN topics TEXT NOT NULL DEFAULT '[]'`)
  } catch {
    // column already exists — ignore
  }
  instances.set(path, db)
  return db
}

export function upsertArticles(articles: RawArticle[], path = DEFAULT_DB_PATH): void {
  const db = getDb(path)
  const stmt = db.prepare(`
    INSERT INTO articles (id, source, title, url, score, comment_count, subreddit, author, fetched_at, topics)
    VALUES (@id, @source, @title, @url, @score, @comment_count, @subreddit, @author, @fetched_at, @topics)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      score = excluded.score,
      comment_count = excluded.comment_count,
      fetched_at = excluded.fetched_at,
      topics = excluded.topics
  `)
  const insertMany = db.transaction((rows: RawArticle[]) => {
    for (const row of rows) {
      stmt.run({
        id: row.id,
        source: row.source,
        title: row.title,
        url: row.url,
        score: row.score,
        comment_count: row.comment_count,
        subreddit: row.subreddit,
        author: row.author,
        fetched_at: row.fetched_at,
        topics: JSON.stringify(row.topics ?? []),
      })
    }
  })
  insertMany(articles)
}

export function getArticles(source: string, limit: number, path = DEFAULT_DB_PATH): Article[] {
  const db = getDb(path)
  const safeLimit = Math.min(limit, 200)
  if (source === 'all') {
    const rows = db.prepare(
      `SELECT * FROM articles ORDER BY fetched_at DESC, score DESC LIMIT ?`
    ).all(safeLimit) as (Article & { topics: string })[]
    return rows.map(row => ({ ...row, topics: JSON.parse(row.topics ?? '[]') }))
  }
  const rows = db.prepare(
    `SELECT * FROM articles WHERE source = ? ORDER BY fetched_at DESC, score DESC LIMIT ?`
  ).all(source, safeLimit) as (Article & { topics: string })[]
  return rows.map(row => ({ ...row, topics: JSON.parse(row.topics ?? '[]') }))
}

export function getArticlesByTopics(
  topics: string[],
  source: string,
  limit: number,
  path = DEFAULT_DB_PATH
): Article[] {
  const db = getDb(path)
  const cap = Math.min(limit, 200)
  const placeholders = topics.map(() => '?').join(',')
  const sourceClause = source === 'all' ? '' : `AND source = ?`
  const rows = db.prepare(`
    SELECT a.* FROM articles a
    WHERE EXISTS (
      SELECT 1 FROM json_each(a.topics) je
      WHERE je.value IN (${placeholders})
    )
    ${sourceClause}
    ORDER BY fetched_at DESC, score DESC
    LIMIT ?
  `).all(...topics, ...(source !== 'all' ? [source] : []), cap) as any[]
  return rows.map(row => ({ ...row, topics: JSON.parse(row.topics ?? '[]') }))
}

export function getSummary(id: string, path = DEFAULT_DB_PATH): string | null {
  const row = getDb(path).prepare(
    `SELECT summary FROM articles WHERE id = ?`
  ).get(id) as { summary: string | null } | undefined
  return row?.summary ?? null
}

export function cacheSummary(id: string, summary: string, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`UPDATE articles SET summary = ? WHERE id = ?`).run(summary, id)
}

// ── Todos ──────────────────────────────────────────────────────────────────

export function getTodos(path = DEFAULT_DB_PATH): Todo[] {
  return getDb(path).prepare(
    `SELECT * FROM todos ORDER BY created_at DESC`
  ).all() as Todo[]
}

export function createTodo(
  title: string,
  description: string | null,
  priority: string,
  path = DEFAULT_DB_PATH
): Todo {
  const now = new Date().toISOString()
  const db = getDb(path)
  const result = db.prepare(
    `INSERT INTO todos (title, description, priority, done, created_at)
     VALUES (?, ?, ?, 0, ?) RETURNING *`
  ).get(title, description, priority, now) as Todo
  return result
}

export function updateTodo(
  id: number,
  patch: { done?: number; title?: string; priority?: string },
  path = DEFAULT_DB_PATH
): void {
  const db = getDb(path)
  if (patch.done !== undefined) {
    db.prepare(`UPDATE todos SET done = ? WHERE id = ?`).run(patch.done, id)
  }
  if (patch.title !== undefined) {
    db.prepare(`UPDATE todos SET title = ? WHERE id = ?`).run(patch.title, id)
  }
  if (patch.priority !== undefined) {
    db.prepare(`UPDATE todos SET priority = ? WHERE id = ?`).run(patch.priority, id)
  }
}

export function deleteTodo(id: number, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`DELETE FROM todos WHERE id = ?`).run(id)
}

// ── Reminders ──────────────────────────────────────────────────────────────

export function getRemindersByDate(dateStr: string, path = DEFAULT_DB_PATH): Reminder[] {
  return getDb(path).prepare(
    `SELECT * FROM reminders WHERE remind_at LIKE ? ORDER BY remind_at ASC`
  ).all(`${dateStr}%`) as Reminder[]
}

export function getDatesWithReminders(
  year: number,
  month: number,
  path = DEFAULT_DB_PATH
): number[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const rows = getDb(path).prepare(
    `SELECT DISTINCT substr(remind_at, 9, 2) as day FROM reminders WHERE remind_at LIKE ?`
  ).all(`${prefix}%`) as { day: string }[]
  return rows.map(r => parseInt(r.day, 10))
}

export function createReminder(
  title: string,
  description: string | null,
  remind_at: string,
  path = DEFAULT_DB_PATH
): Reminder {
  const now = new Date().toISOString()
  const db = getDb(path)
  const result = db.prepare(
    `INSERT INTO reminders (title, description, remind_at, created_at)
     VALUES (?, ?, ?, ?) RETURNING *`
  ).get(title, description, remind_at, now) as Reminder
  return result
}

export function deleteReminder(id: number, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`DELETE FROM reminders WHERE id = ?`).run(id)
}

// ── Notes ──────────────────────────────────────────────────────────────────

export function getNotes(path = DEFAULT_DB_PATH): Note[] {
  return getDb(path).prepare(
    `SELECT * FROM notes ORDER BY updated_at DESC`
  ).all() as Note[]
}

export function getNote(id: number, path = DEFAULT_DB_PATH): Note | null {
  return (getDb(path).prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note) ?? null
}

export function createNote(
  title: string,
  content: string,
  path = DEFAULT_DB_PATH
): Note {
  const now = new Date().toISOString()
  return getDb(path).prepare(
    `INSERT INTO notes (title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?) RETURNING *`
  ).get(title, content, now, now) as Note
}

export function updateNote(
  id: number,
  patch: { title?: string; content?: string },
  path = DEFAULT_DB_PATH
): void {
  const now = new Date().toISOString()
  const db = getDb(path)
  if (patch.title !== undefined && patch.content !== undefined) {
    db.prepare(`UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?`)
      .run(patch.title, patch.content, now, id)
  } else if (patch.title !== undefined) {
    db.prepare(`UPDATE notes SET title = ?, updated_at = ? WHERE id = ?`)
      .run(patch.title, now, id)
  } else if (patch.content !== undefined) {
    db.prepare(`UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`)
      .run(patch.content, now, id)
  }
}

export function deleteNote(id: number, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`DELETE FROM notes WHERE id = ?`).run(id)
}

// ── Finance ────────────────────────────────────────────────────────────────────

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

export function getTransactions(
  filters: { month?: string; category?: string; type?: string; q?: string },
  path = DEFAULT_DB_PATH
): Transaction[] {
  let q = `SELECT * FROM finance_transactions WHERE 1=1`
  const p: unknown[] = []
  if (filters.month)    { q += ` AND date LIKE ?`;         p.push(`${filters.month}%`) }
  if (filters.category) { q += ` AND category = ?`;        p.push(filters.category) }
  if (filters.type)     { q += ` AND type = ?`;            p.push(filters.type) }
  if (filters.q)        { q += ` AND description LIKE ?`;  p.push(`%${filters.q}%`) }
  q += ` ORDER BY date DESC, created_at DESC`
  return getDb(path).prepare(q).all(...p) as Transaction[]
}

export function getTransactionSummary(month: string, path = DEFAULT_DB_PATH) {
  const db = getDb(path)
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
      COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit,
      COUNT(*) as count
    FROM finance_transactions WHERE date LIKE ?
  `).get(`${month}%`) as { credit: number; debit: number; count: number }
  const by_category = db.prepare(`
    SELECT category, SUM(amount) as amount
    FROM finance_transactions WHERE date LIKE ? AND type='debit'
    GROUP BY category ORDER BY amount DESC
  `).all(`${month}%`) as { category: string; amount: number }[]
  return { ...totals, by_category }
}

export function createTransaction(
  data: { date: string; description: string; amount: number; type: string; category: string; source: string; reference?: string | null },
  path = DEFAULT_DB_PATH
): Transaction {
  const now = new Date().toISOString()
  return getDb(path).prepare(`
    INSERT INTO finance_transactions (date, description, amount, type, category, source, reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).get(data.date, data.description, data.amount, data.type, data.category, data.source, data.reference ?? null, now) as Transaction
}

export function importTransactions(
  rows: { date: string; description: string; amount: number; type: string; category: string; source: string }[],
  path = DEFAULT_DB_PATH
): number {
  const db = getDb(path)
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO finance_transactions (date, description, amount, type, category, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction((rows: typeof rows) => {
    let n = 0
    for (const r of rows) { stmt.run(r.date, r.description, r.amount, r.type, r.category, r.source, now); n++ }
    return n
  })
  return tx(rows)
}

export function deleteTransaction(id: number, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`DELETE FROM finance_transactions WHERE id = ?`).run(id)
}

export function getBudgets(month: string, path = DEFAULT_DB_PATH): Budget[] {
  return getDb(path).prepare(`SELECT * FROM finance_budgets WHERE month = ? ORDER BY category`).all(month) as Budget[]
}

export function upsertBudget(category: string, amount: number, month: string, path = DEFAULT_DB_PATH): Budget {
  const now = new Date().toISOString()
  return getDb(path).prepare(`
    INSERT INTO finance_budgets (category, amount, month, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(category, month) DO UPDATE SET amount = excluded.amount
    RETURNING *
  `).get(category, amount, month, now) as Budget
}

export function deleteBudget(id: number, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`DELETE FROM finance_budgets WHERE id = ?`).run(id)
}

export function getMonthlyTotals(numMonths: number, path = DEFAULT_DB_PATH): MonthlyTotal[] {
  const rows = getDb(path).prepare(`
    SELECT substr(date,1,7) as month,
      COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
      COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit
    FROM finance_transactions
    GROUP BY substr(date,1,7) ORDER BY month DESC LIMIT ?
  `).all(numMonths) as MonthlyTotal[]
  return rows.reverse()
}
