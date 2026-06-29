import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import type { RawArticle, Article } from './types'

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

export function getSummary(id: string, path = DEFAULT_DB_PATH): string | null {
  const row = getDb(path).prepare(
    `SELECT summary FROM articles WHERE id = ?`
  ).get(id) as { summary: string | null } | undefined
  return row?.summary ?? null
}

export function cacheSummary(id: string, summary: string, path = DEFAULT_DB_PATH): void {
  getDb(path).prepare(`UPDATE articles SET summary = ? WHERE id = ?`).run(summary, id)
}
