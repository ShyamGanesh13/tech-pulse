import { createClient } from '@libsql/client'
import type { Row } from '@libsql/client'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { RawArticle, Article, Todo, Nyabagam, Note, Transaction, Budget, MonthlyTotal, UraiConversation, UraiMessage, UraiSource, VaultMetaRow, VaultItemRow, VaultFolderRow, User } from './types'

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
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL,
      firebase_uid  TEXT,
      name          TEXT,
      picture       TEXT,
      created_at    TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fbuid ON users(firebase_uid);
    -- articles is GLOBAL public content (HN/Reddit/arXiv). No user_id: one fetch
    -- serves every tenant. Per-user state lives in user_articles below.
    -- summary and embedding stay global too: both derive purely from the public
    -- article text, are identical for every reader, and caching them once is the
    -- bulk of the AI cost saving.
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
      topics TEXT NOT NULL DEFAULT '[]',
      embedding TEXT,
      relevance INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_fetched_at ON articles(fetched_at);
    -- Per-user article state. Replaces the old articles.bookmarked column.
    CREATE TABLE IF NOT EXISTS user_articles (
      user_id    TEXT NOT NULL,
      article_id TEXT NOT NULL,
      bookmarked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, article_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_articles_bm ON user_articles(user_id, bookmarked);
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      due_date TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, created_at);
    CREATE TABLE IF NOT EXISTS nyabagam (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      remind_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      notified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_remind_at ON nyabagam(user_id, remind_at);
    -- id is a uuid WE generate, not an autoincrement integer. Catalyst ROWIDs are
    -- 17 digits and cannot round-trip through a JS number, so owning the id keeps
    -- it identical on both backends and lets an insert return without a re-read.
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'debit',
      category TEXT NOT NULL DEFAULT 'Other',
      source TEXT NOT NULL DEFAULT 'manual',
      reference TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fin_date ON finance_transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_fin_cat ON finance_transactions(user_id, category);
    -- UNIQUE includes user_id: without it two tenants collide on the same
    -- category+month and one would overwrite the other's budget.
    CREATE TABLE IF NOT EXISTS finance_budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, category, month)
    );
    CREATE INDEX IF NOT EXISTS idx_fin_bud_month ON finance_budgets(user_id, month);
    -- endpoint is unique per (user, endpoint): the same browser could in
    -- principle be used by two accounts, and each needs its own subscription.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, endpoint)
    );
    CREATE TABLE IF NOT EXISTS urai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_urai_conv_user ON urai_conversations(user_id, updated_at);
    -- user_id is denormalized here (reachable via conversation_id) so that no
    -- query's correctness depends on remembering to join through the parent.
    -- conversation_id holds the parent's UUID, not a foreign key to its ROWID.
    -- Catalyst FK columns reference ROWID, which is 17 digits and cannot survive a
    -- JS number, so keeping the uuid keeps ROWID out of the data model entirely.
    -- The cost is that deleting a conversation needs two scoped deletes instead of
    -- an ON-DELETE-CASCADE.
    CREATE TABLE IF NOT EXISTS urai_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_urai_messages_conv ON urai_messages(user_id, conversation_id);
    -- Was a hard singleton (id INTEGER PRIMARY KEY CHECK (id = 1)). Now one row
    -- per user: each derives their own DEK from their own master password, so one
    -- user's key material cannot decrypt another's items.
    CREATE TABLE IF NOT EXISTS vault_meta (
      user_id TEXT PRIMARY KEY,
      kdf_salt TEXT NOT NULL,
      kdf_iterations INTEGER NOT NULL,
      wrapped_dek TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vault_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vault_items_deleted ON vault_items(user_id, deleted_at);
    CREATE TABLE IF NOT EXISTS vault_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT,
      iv TEXT NOT NULL,
      name_ct TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vault_folders_parent ON vault_folders(user_id, parent_id);
  `)
  // NOTE: the old try/catch ALTER TABLE block is deliberately gone. Every column
  // it used to add (topics, notified_at, embedding, due_date, relevance,
  // completed_at) is now declared directly above, and articles.bookmarked no
  // longer exists at all — user_articles replaced it. Re-adding it here would
  // resurrect a column the code no longer reads.
  //
  // Never put DROP statements in here: this runs on every boot, so a DROP would
  // destroy live data on every redeploy. Destructive changes go in
  // scripts/migrate-tenancy.ts, which requires an explicit confirmation flag.
}

// Fail closed. A scoped query with no user must throw, never silently fall back
// to returning every tenant's rows.
function requireUser(userId: string, fn: string): void {
  if (!userId) throw new Error(`${fn}: userId is required`)
}

// ── Articles ───────────────────────────────────────────────────────────────

export async function upsertArticles(articles: RawArticle[]): Promise<void> {
  await ensureInit()
  if (articles.length === 0) return
  const sql = `
    INSERT INTO articles (id, source, title, url, score, comment_count, subreddit, author, fetched_at, topics, relevance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      score = excluded.score,
      comment_count = excluded.comment_count,
      fetched_at = excluded.fetched_at,
      topics = excluded.topics,
      relevance = excluded.relevance
  `
  await client.batch(
    articles.map(a => ({
      sql,
      args: [a.id, a.source, a.title, a.url, a.score, a.comment_count, a.subreddit ?? null, a.author ?? null, a.fetched_at, JSON.stringify(a.topics ?? []), a.relevance ?? (a.topics?.length ?? 0)],
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
  // Unscoped BY DESIGN: runs from the global fetch script. Must delete only
  // articles that NO tenant has bookmarked, otherwise one user's refresh would
  // delete an article out from under another user's bookmark.
  await client.execute(`
    DELETE FROM articles
    WHERE NOT EXISTS (
      SELECT 1 FROM user_articles ua
      WHERE ua.article_id = articles.id AND ua.bookmarked = 1
    )
  `)
}

export async function setBookmark(userId: string, articleId: string, bookmarked: boolean): Promise<void> {
  requireUser(userId, 'setBookmark')
  await ensureInit()
  await client.execute({
    sql: `INSERT INTO user_articles (user_id, article_id, bookmarked, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, article_id) DO UPDATE SET bookmarked = excluded.bookmarked`,
    args: [userId, articleId, bookmarked ? 1 : 0, new Date().toISOString()],
  })
}

export async function deleteBookmark(userId: string, articleId: string): Promise<void> {
  requireUser(userId, 'deleteBookmark')
  await ensureInit()
  await client.execute({
    sql: `UPDATE user_articles SET bookmarked = 0 WHERE user_id = ? AND article_id = ?`,
    args: [userId, articleId],
  })
}

export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  requireUser(userId, 'getBookmarkedArticles')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT a.*, 1 AS bookmarked
          FROM articles a
          JOIN user_articles ua ON ua.article_id = a.id
          WHERE ua.user_id = ? AND ua.bookmarked = 1
          ORDER BY a.fetched_at DESC`,
    args: [userId],
  })
  return toArticles(result)
}

// The feed excludes the CALLER'S bookmarked articles, as the old
// `WHERE bookmarked = 0` did — but that state is per-user now, so it comes from
// a LEFT JOIN instead of a column on articles.
export async function getArticles(userId: string, source: string, limit: number): Promise<Article[]> {
  requireUser(userId, 'getArticles')
  await ensureInit()
  const safeLimit = Math.min(limit, 200)
  const base = `
    SELECT a.*, COALESCE(ua.bookmarked, 0) AS bookmarked
    FROM articles a
    LEFT JOIN user_articles ua ON ua.article_id = a.id AND ua.user_id = ?
    WHERE COALESCE(ua.bookmarked, 0) = 0
  `
  const order = `ORDER BY a.relevance DESC, a.fetched_at DESC, a.score DESC LIMIT ?`
  const result = source === 'all'
    ? await client.execute({ sql: `${base} ${order}`, args: [userId, safeLimit] })
    : await client.execute({ sql: `${base} AND a.source = ? ${order}`, args: [userId, source, safeLimit] })
  return toArticles(result)
}

export async function getArticlesByTopics(userId: string, topics: string[], source: string, limit: number): Promise<Article[]> {
  requireUser(userId, 'getArticlesByTopics')
  await ensureInit()
  const cap = Math.min(limit, 200)
  const placeholders = topics.map(() => '?').join(',')
  const sourceClause = source === 'all' ? '' : `AND a.source = ?`
  const args: (string | number)[] = [userId, ...topics]
  if (source !== 'all') args.push(source)
  args.push(cap)
  const result = await client.execute({
    sql: `
      SELECT a.*, COALESCE(ua.bookmarked, 0) AS bookmarked
      FROM articles a
      LEFT JOIN user_articles ua ON ua.article_id = a.id AND ua.user_id = ?
      WHERE COALESCE(ua.bookmarked, 0) = 0
      AND EXISTS (
        SELECT 1 FROM json_each(a.topics) je
        WHERE je.value IN (${placeholders})
      )
      ${sourceClause}
      ORDER BY a.relevance DESC, a.fetched_at DESC, a.score DESC
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

export async function getArticlesForSearch(userId: string): Promise<(Article & { embedding: number[] | null })[]> {
  requireUser(userId, 'getArticlesForSearch')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT a.*, COALESCE(ua.bookmarked, 0) AS bookmarked
          FROM articles a
          LEFT JOIN user_articles ua ON ua.article_id = a.id AND ua.user_id = ?
          WHERE COALESCE(ua.bookmarked, 0) = 0
          ORDER BY a.fetched_at DESC, a.score DESC`,
    args: [userId],
  })
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

export async function getTodos(userId: string): Promise<Todo[]> {
  requireUser(userId, 'getTodos')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC`, args: [userId],
  })
  return result.rows.map(r => toObj<Todo>(r, result.columns))
}

export async function getTodosByDate(userId: string, dateStr: string): Promise<Todo[]> {
  requireUser(userId, 'getTodosByDate')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM todos WHERE user_id = ? AND due_date LIKE ? ORDER BY done ASC, created_at DESC`,
    args: [userId, `${dateStr}%`],
  })
  return result.rows.map(r => toObj<Todo>(r, result.columns))
}

/**
 * The rolling agenda for `dateStr`: every task that is still open (whatever its
 * due date, including tasks with none) plus the ones completed on that day, so
 * ticking something off doesn't make it disappear mid-session. Overdue sorts
 * first, then by due date, then by priority.
 */
export async function getAgendaTodos(userId: string, dateStr: string): Promise<Todo[]> {
  requireUser(userId, 'getAgendaTodos')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM todos
          WHERE user_id = ? AND (done = 0 OR completed_at LIKE ?)
          ORDER BY done ASC,
                   (due_date IS NULL) ASC,
                   due_date ASC,
                   CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
                   created_at DESC`,
    args: [userId, `${dateStr}%`],
  })
  return result.rows.map(r => toObj<Todo>(r, result.columns))
}

export async function getDatesWithTodos(userId: string, year: number, month: number): Promise<number[]> {
  requireUser(userId, 'getDatesWithTodos')
  await ensureInit()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const result = await client.execute({
    sql: `SELECT DISTINCT substr(due_date, 9, 2) as day FROM todos WHERE user_id = ? AND due_date LIKE ?`,
    args: [userId, `${prefix}%`],
  })
  return result.rows.map(r => parseInt(r[0] as string, 10)).filter(n => !isNaN(n))
}

export async function createTodo(userId: string, title: string, description: string | null, priority: string, due_date?: string | null): Promise<Todo> {
  requireUser(userId, 'createTodo')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO todos (id, user_id, title, description, priority, due_date, done, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [id, userId, title, description, priority, due_date ?? null, now],
  })
  // Built from values already held — no RETURNING, which Catalyst lacks too.
  return {
    id, user_id: userId, title, description, priority: priority as Todo['priority'],
    done: 0, due_date: due_date ?? null, completed_at: null, created_at: now,
  }
}

export async function updateTodo(userId: string, id: string, patch: { done?: number; title?: string; priority?: string; due_date?: string | null; completed_at?: string | null }): Promise<void> {
  requireUser(userId, 'updateTodo')
  await ensureInit()
  // Every statement carries AND user_id = ?: without it, guessing an integer id
  // would let one tenant overwrite another's task.
  if (patch.done !== undefined) {
    // Stamp when it was ticked so the agenda can keep showing today's completions.
    // The caller passes its own local timestamp; the UTC fallback is only for
    // clients that don't (the client's local date is what the agenda filters on).
    const completedAt = patch.done
      ? (patch.completed_at ?? new Date().toISOString())
      : null
    await client.execute({
      sql: `UPDATE todos SET done = ?, completed_at = ? WHERE id = ? AND user_id = ?`,
      args: [patch.done, completedAt, id, userId],
    })
  }
  if (patch.title !== undefined) {
    await client.execute({ sql: `UPDATE todos SET title = ? WHERE id = ? AND user_id = ?`, args: [patch.title, id, userId] })
  }
  if (patch.priority !== undefined) {
    await client.execute({ sql: `UPDATE todos SET priority = ? WHERE id = ? AND user_id = ?`, args: [patch.priority, id, userId] })
  }
  if (patch.due_date !== undefined) {
    await client.execute({ sql: `UPDATE todos SET due_date = ? WHERE id = ? AND user_id = ?`, args: [patch.due_date, id, userId] })
  }
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteTodo')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM todos WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

// ── Nyabagam ───────────────────────────────────────────────────────────────

export async function getNyabagamByDate(userId: string, dateStr: string): Promise<Nyabagam[]> {
  requireUser(userId, 'getNyabagamByDate')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM nyabagam WHERE user_id = ? AND remind_at LIKE ? ORDER BY remind_at ASC`,
    args: [userId, `${dateStr}%`],
  })
  return result.rows.map(r => toObj<Nyabagam>(r, result.columns))
}

/**
 * Reminders falling after `dateStr` and within the next `days` days — the
 * "Upcoming" group, so a reminder set for tomorrow is visible today.
 */
export async function getUpcomingNyabagam(userId: string, dateStr: string, days = 14): Promise<Nyabagam[]> {
  requireUser(userId, 'getUpcomingNyabagam')
  await ensureInit()
  const end = new Date(`${dateStr}T00:00:00`)
  end.setDate(end.getDate() + days)
  const endStr = end.toISOString().slice(0, 10)
  const result = await client.execute({
    sql: `SELECT * FROM nyabagam
          WHERE user_id = ?
            AND substr(remind_at, 1, 10) > ? AND substr(remind_at, 1, 10) <= ?
          ORDER BY remind_at ASC`,
    args: [userId, dateStr, endStr],
  })
  return result.rows.map(r => toObj<Nyabagam>(r, result.columns))
}

export async function getDatesWithNyabagam(userId: string, year: number, month: number): Promise<number[]> {
  requireUser(userId, 'getDatesWithNyabagam')
  await ensureInit()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const result = await client.execute({
    sql: `SELECT DISTINCT substr(remind_at, 9, 2) as day FROM nyabagam WHERE user_id = ? AND remind_at LIKE ?`,
    args: [userId, `${prefix}%`],
  })
  return result.rows.map(r => parseInt(r[0] as string, 10))
}

export async function createNyabagam(userId: string, title: string, description: string | null, remind_at: string): Promise<Nyabagam> {
  requireUser(userId, 'createNyabagam')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO nyabagam (id, user_id, title, description, remind_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, title, description, remind_at, now],
  })
  return { id, user_id: userId, title, description, remind_at, created_at: now }
}

export async function deleteNyabagam(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteNyabagam')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM nyabagam WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

// NOT scoped — called only by the reminder cron, which needs to sweep ALL users'
// due reminders in one pass. Plan 3 gives the cron a CRON_SECRET and makes it
// deliver each row only to that row's owner (see getPushSubscriptionsForUser).
// Scoping this now, without the cron's per-user loop, would break reminders
// entirely. The returned rows carry user_id so the caller can route them.
export async function getDueNyabagam(windowMinutes = 2): Promise<Nyabagam[]> {
  await ensureInit()
  const now = new Date().toISOString()
  const past = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const result = await client.execute({
    sql: `SELECT * FROM nyabagam WHERE remind_at > ? AND remind_at <= ? AND (notified_at IS NULL)`,
    args: [past, now],
  })
  return result.rows.map(r => toObj<Nyabagam>(r, result.columns))
}

// Scoped variant for the in-app trigger, which must only surface the caller's
// OWN due reminders. The unscoped sweep above exists solely for the cron.
export async function getDueNyabagamForUser(userId: string, windowMinutes = 2): Promise<Nyabagam[]> {
  requireUser(userId, 'getDueNyabagamForUser')
  await ensureInit()
  const now = new Date().toISOString()
  const past = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const result = await client.execute({
    sql: `SELECT * FROM nyabagam
          WHERE user_id = ? AND remind_at > ? AND remind_at <= ? AND (notified_at IS NULL)`,
    args: [userId, past, now],
  })
  return result.rows.map(r => toObj<Nyabagam>(r, result.columns))
}

// NOT scoped — cron-only, same reason as getDueNyabagam. The id comes from a row
// the cron just read, so it is not attacker-supplied.
export async function markNyabagamNotified(id: string): Promise<void> {
  await ensureInit()
  await client.execute({ sql: `UPDATE nyabagam SET notified_at = ? WHERE id = ?`, args: [new Date().toISOString(), id] })
}

// ── Push subscriptions ─────────────────────────────────────────────────────

export async function savePushSubscription(userId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
  requireUser(userId, 'savePushSubscription')
  await ensureInit()
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [userId, endpoint, p256dh, auth, now],
  })
}

// Per-user lookup used by the cron to route a reminder to its OWNER only.
// Without this the cron would push every user's reminders to every device.
export async function getPushSubscriptionsForUser(userId: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  requireUser(userId, 'getPushSubscriptionsForUser')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`, args: [userId],
  })
  return result.rows.map(r => toObj(r, result.columns)) as { endpoint: string; p256dh: string; auth: string }[]
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  requireUser(userId, 'deletePushSubscription')
  await ensureInit()
  await client.execute({
    sql: `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, args: [userId, endpoint],
  })
}

// ── Notes ──────────────────────────────────────────────────────────────────

export async function getNotes(userId: string): Promise<Note[]> {
  requireUser(userId, 'getNotes')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC`, args: [userId],
  })
  return result.rows.map(r => toObj<Note>(r, result.columns))
}

export async function getNote(userId: string, id: string): Promise<Note | null> {
  requireUser(userId, 'getNote')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM notes WHERE id = ? AND user_id = ?`, args: [id, userId],
  })
  if (result.rows.length === 0) return null
  return toObj<Note>(result.rows[0], result.columns)
}

export async function createNote(userId: string, title: string, content: string): Promise<Note> {
  requireUser(userId, 'createNote')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, title, content, now, now],
  })
  // Returned from the values we already hold — no RETURNING, which Catalyst
  // does not support either.
  return { id, user_id: userId, title, content, created_at: now, updated_at: now }
}

export async function updateNote(userId: string, id: string, patch: { title?: string; content?: string }): Promise<void> {
  requireUser(userId, 'updateNote')
  await ensureInit()
  const now = new Date().toISOString()
  // AND user_id = ? on every branch: `WHERE id = ?` alone would let one tenant
  // overwrite another's note by guessing a small integer.
  if (patch.title !== undefined && patch.content !== undefined) {
    await client.execute({ sql: `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?`, args: [patch.title, patch.content, now, id, userId] })
  } else if (patch.title !== undefined) {
    await client.execute({ sql: `UPDATE notes SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`, args: [patch.title, now, id, userId] })
  } else if (patch.content !== undefined) {
    await client.execute({ sql: `UPDATE notes SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?`, args: [patch.content, now, id, userId] })
  }
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteNote')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM notes WHERE id = ? AND user_id = ?`, args: [id, userId] })
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
  userId: string,
  filters: { month?: string; category?: string; type?: string; q?: string }
): Promise<Transaction[]> {
  requireUser(userId, 'getTransactions')
  await ensureInit()
  let sql = `SELECT * FROM finance_transactions WHERE user_id = ?`
  const args: (string | number)[] = [userId]
  if (filters.month)    { sql += ` AND date LIKE ?`;         args.push(`${filters.month}%`) }
  if (filters.category) { sql += ` AND category = ?`;        args.push(filters.category) }
  if (filters.type)     { sql += ` AND type = ?`;            args.push(filters.type) }
  if (filters.q)        { sql += ` AND description LIKE ?`;  args.push(`%${filters.q}%`) }
  sql += ` ORDER BY date DESC, created_at DESC`
  const result = await client.execute({ sql, args })
  return result.rows.map(r => toObj<Transaction>(r, result.columns))
}

// Aggregates are the most dangerous thing to leave unscoped: an unscoped SUM
// blends every tenant's spending into one plausible-looking number rather than
// failing loudly, so it would not look wrong in testing.
export async function getTransactionSummary(userId: string, month: string) {
  requireUser(userId, 'getTransactionSummary')
  await ensureInit()
  const totalsResult = await client.execute({
    sql: `
      SELECT
        COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
        COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit,
        COUNT(*) as count
      FROM finance_transactions WHERE user_id = ? AND date LIKE ?
    `,
    args: [userId, `${month}%`],
  })
  const totals = toObj<{ credit: number; debit: number; count: number }>(totalsResult.rows[0], totalsResult.columns)
  const catResult = await client.execute({
    sql: `
      SELECT category, SUM(amount) as amount
      FROM finance_transactions WHERE user_id = ? AND date LIKE ? AND type='debit'
      GROUP BY category ORDER BY amount DESC
    `,
    args: [userId, `${month}%`],
  })
  const by_category = catResult.rows.map(r => toObj<{ category: string; amount: number }>(r, catResult.columns))
  return { ...totals, by_category }
}

export async function createTransaction(
  userId: string,
  data: { date: string; description: string; amount: number; type: string; category: string; source: string; reference?: string | null }
): Promise<Transaction> {
  requireUser(userId, 'createTransaction')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO finance_transactions (id, user_id, date, description, amount, type, category, source, reference, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, data.date, data.description, data.amount, data.type, data.category, data.source, data.reference ?? null, now],
  })
  return {
    id, user_id: userId, date: data.date, description: data.description,
    amount: data.amount, type: data.type as Transaction['type'], category: data.category,
    source: data.source, reference: data.reference ?? null, created_at: now,
  }
}

export async function importTransactions(
  userId: string,
  rows: { date: string; description: string; amount: number; type: string; category: string; source: string }[]
): Promise<number> {
  requireUser(userId, 'importTransactions')
  await ensureInit()
  const now = new Date().toISOString()
  if (rows.length === 0) return 0
  await client.batch(
    rows.map(r => ({
      sql: `INSERT INTO finance_transactions (id, user_id, date, description, amount, type, category, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), userId, r.date, r.description, r.amount, r.type, r.category, r.source, now],
    })),
    'write'
  )
  return rows.length
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteTransaction')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM finance_transactions WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

export async function getImportSources(userId: string): Promise<{ source: string; count: number; min_date: string; max_date: string }[]> {
  requireUser(userId, 'getImportSources')
  await ensureInit()
  const result = await client.execute({
    sql: `
      SELECT source, COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date
      FROM finance_transactions
      WHERE user_id = ?
      GROUP BY source
      ORDER BY MAX(created_at) DESC
    `,
    args: [userId],
  })
  return result.rows.map(r => toObj(r, result.columns)) as { source: string; count: number; min_date: string; max_date: string }[]
}

export async function deleteTransactionsBySource(userId: string, source: string): Promise<number> {
  requireUser(userId, 'deleteTransactionsBySource')
  await ensureInit()
  const result = await client.execute({
    sql: `DELETE FROM finance_transactions WHERE user_id = ? AND source = ?`, args: [userId, source],
  })
  return Number(result.rowsAffected)
}

export async function getBudgets(userId: string, month: string): Promise<Budget[]> {
  requireUser(userId, 'getBudgets')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM finance_budgets WHERE user_id = ? AND month = ? ORDER BY category`,
    args: [userId, month],
  })
  return result.rows.map(r => toObj<Budget>(r, result.columns))
}

export async function upsertBudget(userId: string, category: string, amount: number, month: string): Promise<Budget> {
  requireUser(userId, 'upsertBudget')
  await ensureInit()
  const now = new Date().toISOString()
  // Conflict target includes user_id, matching the UNIQUE(user_id, category,
  // month) constraint — otherwise two tenants would overwrite each other's
  // budget for the same category.
  // RETURNING is kept here only because an upsert may hit either path: on
  // conflict the EXISTING row's id must come back, not the one generated below.
  // Catalyst supports neither ON CONFLICT nor RETURNING, so its adapter will do
  // an explicit scoped read-then-write.
  const result = await client.execute({
    sql: `INSERT INTO finance_budgets (id, user_id, category, amount, month, created_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, category, month) DO UPDATE SET amount = excluded.amount
          RETURNING *`,
    args: [randomUUID(), userId, category, amount, month, now],
  })
  return toObj<Budget>(result.rows[0], result.columns)
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteBudget')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM finance_budgets WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

export async function getMonthlyTotals(userId: string, numMonths: number): Promise<MonthlyTotal[]> {
  requireUser(userId, 'getMonthlyTotals')
  await ensureInit()
  const result = await client.execute({
    sql: `
      SELECT substr(date,1,7) as month,
        COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0) as credit,
        COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END),0) as debit
      FROM finance_transactions
      WHERE user_id = ?
      GROUP BY substr(date,1,7) ORDER BY month DESC LIMIT ?
    `,
    args: [userId, numMonths],
  })
  return result.rows.map(r => toObj<MonthlyTotal>(r, result.columns)).reverse()
}

// ── Urai (chat) ──────────────────────────────────────────────────────────────

export async function listConversations(userId: string): Promise<UraiConversation[]> {
  requireUser(userId, 'listConversations')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM urai_conversations WHERE user_id = ? ORDER BY updated_at DESC`,
    args: [userId],
  })
  return result.rows.map(r => toObj<UraiConversation>(r, result.columns))
}

export async function createConversation(userId: string, title = 'New chat'): Promise<UraiConversation> {
  requireUser(userId, 'createConversation')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO urai_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, title, now, now],
  })
  return { id, user_id: userId, title, created_at: now, updated_at: now }
}

export async function renameConversation(userId: string, id: string, title: string): Promise<void> {
  requireUser(userId, 'renameConversation')
  await ensureInit()
  await client.execute({
    sql: `UPDATE urai_conversations SET title = ? WHERE id = ? AND user_id = ?`,
    args: [title, id, userId],
  })
}

export async function touchConversation(userId: string, id: string): Promise<void> {
  requireUser(userId, 'touchConversation')
  await ensureInit()
  await client.execute({
    sql: `UPDATE urai_conversations SET updated_at = ? WHERE id = ? AND user_id = ?`,
    args: [new Date().toISOString(), id, userId],
  })
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  requireUser(userId, 'deleteConversation')
  await ensureInit()
  // Both statements scoped: urai_messages carries its own user_id precisely so
  // this does not depend on joining through the parent conversation.
  await client.execute({ sql: `DELETE FROM urai_messages WHERE conversation_id = ? AND user_id = ?`, args: [id, userId] })
  await client.execute({ sql: `DELETE FROM urai_conversations WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

function rowToMessage(r: Record<string, unknown>): UraiMessage {
  return {
    ...(r as unknown as UraiMessage),
    sources: r.sources ? (JSON.parse(r.sources as string) as UraiSource[]) : null,
  }
}

export async function getMessages(userId: string, conversationId: string): Promise<UraiMessage[]> {
  requireUser(userId, 'getMessages')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM urai_messages WHERE conversation_id = ? AND user_id = ? ORDER BY id ASC`,
    args: [conversationId, userId],
  })
  return result.rows.map(r => rowToMessage(toObj<Record<string, unknown>>(r, result.columns)))
}

export async function addMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources: UraiSource[] | null = null,
): Promise<UraiMessage> {
  requireUser(userId, 'addMessage')
  await ensureInit()
  const now = new Date().toISOString()
  const id = randomUUID()
  await client.execute({
    sql: `INSERT INTO urai_messages (id, user_id, conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, conversationId, role, content, sources ? JSON.stringify(sources) : null, now],
  })
  await touchConversation(userId, conversationId)
  return { id, user_id: userId, conversation_id: conversationId, role, content, sources, created_at: now }
}

export async function getConversation(userId: string, id: string): Promise<UraiConversation | null> {
  requireUser(userId, 'getConversation')
  await ensureInit()
  const result = await client.execute({
    sql: `SELECT * FROM urai_conversations WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  })
  if (result.rows.length === 0) return null
  return toObj<UraiConversation>(result.rows[0], result.columns)
}

// ── Vault ────────────────────────────────────────────────────────────────────

// vault_meta is now one row PER USER (was a hard singleton keyed on id = 1).
// Each user derives their own DEK from their own master password, so one user's
// key material mathematically cannot decrypt another user's items.
export async function getVaultMeta(userId: string): Promise<VaultMetaRow | null> {
  requireUser(userId, 'getVaultMeta')
  await ensureInit()
  const r = await client.execute({
    sql: `SELECT user_id, kdf_salt, kdf_iterations, wrapped_dek, created_at
          FROM vault_meta WHERE user_id = ?`,
    args: [userId],
  })
  return r.rows.length ? toObj<VaultMetaRow>(r.rows[0], r.columns) : null
}

export async function setVaultMeta(userId: string, m: { kdf_salt: string; kdf_iterations: number; wrapped_dek: string }): Promise<void> {
  requireUser(userId, 'setVaultMeta')
  await ensureInit()
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO vault_meta (user_id, kdf_salt, kdf_iterations, wrapped_dek, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET kdf_salt = excluded.kdf_salt,
            kdf_iterations = excluded.kdf_iterations, wrapped_dek = excluded.wrapped_dek`,
    args: [userId, m.kdf_salt, m.kdf_iterations, m.wrapped_dek, now],
  })
}

// Vault ids are UUID strings, which makes guessing harder — but that is NOT a
// security boundary, so every statement below still carries AND user_id = ?.
export async function getVaultItems(userId: string, includeDeleted = false): Promise<VaultItemRow[]> {
  requireUser(userId, 'getVaultItems')
  await ensureInit()
  const sql = includeDeleted
    ? `SELECT * FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM vault_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`
  const r = await client.execute({ sql, args: [userId] })
  return r.rows.map(row => toObj<VaultItemRow>(row, r.columns))
}

export async function createVaultItem(userId: string, row: { id: string; iv: string; ciphertext: string }): Promise<VaultItemRow> {
  requireUser(userId, 'createVaultItem')
  await ensureInit()
  const now = new Date().toISOString()
  const r = await client.execute({
    sql: `INSERT INTO vault_items (id, user_id, iv, ciphertext, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [row.id, userId, row.iv, row.ciphertext, now, now],
  })
  return toObj<VaultItemRow>(r.rows[0], r.columns)
}

export async function updateVaultItem(userId: string, id: string, iv: string, ciphertext: string): Promise<void> {
  requireUser(userId, 'updateVaultItem')
  await ensureInit()
  const now = new Date().toISOString()
  await client.execute({
    sql: `UPDATE vault_items SET iv = ?, ciphertext = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    args: [iv, ciphertext, now, id, userId],
  })
}

export async function softDeleteVaultItem(userId: string, id: string): Promise<void> {
  requireUser(userId, 'softDeleteVaultItem')
  await ensureInit()
  await client.execute({ sql: `UPDATE vault_items SET deleted_at = ? WHERE id = ? AND user_id = ?`, args: [new Date().toISOString(), id, userId] })
}
export async function restoreVaultItem(userId: string, id: string): Promise<void> {
  requireUser(userId, 'restoreVaultItem')
  await ensureInit()
  await client.execute({ sql: `UPDATE vault_items SET deleted_at = NULL WHERE id = ? AND user_id = ?`, args: [id, userId] })
}
export async function hardDeleteVaultItem(userId: string, id: string): Promise<void> {
  requireUser(userId, 'hardDeleteVaultItem')
  await ensureInit()
  await client.execute({ sql: `DELETE FROM vault_items WHERE id = ? AND user_id = ?`, args: [id, userId] })
}

export async function getVaultFolders(userId: string, includeDeleted = false): Promise<VaultFolderRow[]> {
  requireUser(userId, 'getVaultFolders')
  await ensureInit()
  const sql = includeDeleted
    ? `SELECT * FROM vault_folders WHERE user_id = ? ORDER BY sort_order ASC`
    : `SELECT * FROM vault_folders WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`
  const r = await client.execute({ sql, args: [userId] })
  return r.rows.map(row => toObj<VaultFolderRow>(row, r.columns))
}

export async function createVaultFolder(userId: string, row: { id: string; parent_id: string | null; iv: string; name_ct: string; sort_order: number }): Promise<VaultFolderRow> {
  requireUser(userId, 'createVaultFolder')
  await ensureInit()
  const now = new Date().toISOString()
  const r = await client.execute({
    sql: `INSERT INTO vault_folders (id, user_id, parent_id, iv, name_ct, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [row.id, userId, row.parent_id, row.iv, row.name_ct, row.sort_order, now],
  })
  return toObj<VaultFolderRow>(r.rows[0], r.columns)
}

export async function updateVaultFolder(userId: string, id: string, patch: { parent_id?: string | null; iv?: string; name_ct?: string; sort_order?: number }): Promise<void> {
  requireUser(userId, 'updateVaultFolder')
  await ensureInit()
  if (patch.parent_id !== undefined) await client.execute({ sql: `UPDATE vault_folders SET parent_id = ? WHERE id = ? AND user_id = ?`, args: [patch.parent_id, id, userId] })
  if (patch.iv !== undefined) await client.execute({ sql: `UPDATE vault_folders SET iv = ? WHERE id = ? AND user_id = ?`, args: [patch.iv, id, userId] })
  if (patch.name_ct !== undefined) await client.execute({ sql: `UPDATE vault_folders SET name_ct = ? WHERE id = ? AND user_id = ?`, args: [patch.name_ct, id, userId] })
  if (patch.sort_order !== undefined) await client.execute({ sql: `UPDATE vault_folders SET sort_order = ? WHERE id = ? AND user_id = ?`, args: [patch.sort_order, id, userId] })
}

export async function softDeleteVaultFolder(userId: string, id: string): Promise<void> {
  requireUser(userId, 'softDeleteVaultFolder')
  await ensureInit()
  await client.execute({ sql: `UPDATE vault_folders SET deleted_at = ? WHERE id = ? AND user_id = ?`, args: [new Date().toISOString(), id, userId] })
}

// ── Users ──────────────────────────────────────────────────────────────────

function toUser(result: { rows: Row[]; columns: string[] }): User | null {
  if (result.rows.length === 0) return null
  return toObj<User>(result.rows[0], result.columns)
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureInit()
  return toUser(await client.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [id] }))
}

export async function findUserByEmail(email: string): Promise<User | null> {
  await ensureInit()
  return toUser(await client.execute({ sql: `SELECT * FROM users WHERE email = ?`, args: [email] }))
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
  await ensureInit()
  if (!firebaseUid) return null
  return toUser(await client.execute({
    sql: `SELECT * FROM users WHERE firebase_uid = ?`, args: [firebaseUid],
  }))
}

export async function createUser(input: {
  email: string
  firebase_uid: string | null
  name: string | null
  picture: string | null
}): Promise<User> {
  await ensureInit()
  const id = randomUUID()
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO users (id, email, firebase_uid, name, picture, created_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.email, input.firebase_uid, input.name, input.picture, now, now],
  })
  const row = await getUserById(id)
  if (!row) throw new Error('createUser: row missing after insert')
  return row
}

export async function linkFirebaseUid(userId: string, firebaseUid: string): Promise<void> {
  await ensureInit()
  await client.execute({
    sql: `UPDATE users SET firebase_uid = ? WHERE id = ?`, args: [firebaseUid, userId],
  })
}

export async function touchUserLogin(
  userId: string,
  patch: { email?: string; name?: string | null; picture?: string | null },
): Promise<void> {
  await ensureInit()
  const sets: string[] = ['last_login_at = ?']
  const args: (string | null)[] = [new Date().toISOString()]
  if (patch.email !== undefined)   { sets.push('email = ?');   args.push(patch.email) }
  if (patch.name !== undefined)    { sets.push('name = ?');    args.push(patch.name) }
  if (patch.picture !== undefined) { sets.push('picture = ?'); args.push(patch.picture) }
  args.push(userId)
  await client.execute({ sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args })
}
