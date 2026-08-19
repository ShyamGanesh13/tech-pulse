// Articles, ported to Catalyst Cloud Scale.
//
// Structurally the hardest domain, because it is the only one where content is
// GLOBAL and state is PER-USER. Four Catalyst constraints collide here:
//
// 1. NO JOIN without a declared FK relationship. Turso does
//    `articles LEFT JOIN user_articles ON ua.article_id = a.id AND ua.user_id = ?`
//    to exclude the caller's bookmarks from the feed. That is not expressible, so
//    the feed reads the caller's bookmark ids in one query and filters in JS.
//
// 2. NO JSON FUNCTIONS. `json_each(a.topics)` has no equivalent, so topics live in
//    their own article_topics table, one row per (article, topic).
//
// 3. NO COMPOSITE UNIQUE. `PRIMARY KEY (user_id, article_id)` becomes a synthetic
//    `uk` column holding `user_id|article_id`, which is the unique one.
//
// 4. text CAPS AT 10000 CHARS, and a full-precision 768-dim nomic-embed-text
//    embedding serialises to ~16,585 — it does NOT fit. Embeddings are stored
//    quantised to 4 decimal places (~5,753 chars). Cosine similarity is robust to
//    that precision; storing full precision would silently truncate.
//
// Column renames (mapped back here so callers keep the app's shape):
//   source -> feed_source, url -> link_url, id -> article_id
//
// GLOBAL BY DESIGN: articles, summary and embedding carry no user_id. They derive
// from public text, are identical for every reader, and caching them once is most
// of the AI cost saving. Only user_articles is per-tenant.
import type { Article, RawArticle } from './types'
import { zcql, catalystApp, safeUserId } from './catalyst'

const T_ART = 'articles'
const T_TOPIC = 'article_topics'
const T_UA = 'user_articles'

/**
 * Article ids are source-scoped like `hn:42`. ZCQL has no parameter binding, so ids
 * are inlined into query text and this allowlist is the only thing standing between
 * a feed and an injected query. It deliberately excludes `'` (would close the
 * literal) and `*` (ZCQL's LIKE wildcard).
 *
 * `/` is allowed for old-style arXiv ids such as `arxiv:math/0309136`. Guid-derived
 * ids from RSS feeds are hashed at the fetcher (see lib/fetchers/guid-id.ts) rather
 * than widened to accept URL-encoded text, which is what previously broke refresh:
 * a `%` in a Medium id failed this check and aborted the whole run.
 *
 * The 128-char bound matches the article_id column, so an over-long id fails here
 * with a clear message instead of at the datastore.
 */
function safeArticleId(id: string): string {
  if (!/^[A-Za-z0-9:_.\-/]{1,128}$/.test(id)) throw new Error(`invalid article id: ${id}`)
  return id
}

function safeTopic(t: string): string {
  if (!/^[A-Za-z0-9 &+.\-]{1,64}$/.test(t)) throw new Error(`invalid topic: ${t}`)
  return t
}

/** 4dp keeps a 768-dim embedding under the 10000-char text cap. */
export function quantiseEmbedding(v: number[]): string {
  return JSON.stringify(v.map(x => Number(x.toFixed(4))))
}

function toArticle(r: Record<string, unknown>, topics: string[], bookmarked = 0): Article {
  return {
    id: String(r.article_id),
    source: String(r.feed_source) as Article['source'],
    title: String(r.title ?? ''),
    url: String(r.link_url ?? ''),
    score: Number(r.score ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    subreddit: r.subreddit == null ? null : String(r.subreddit),
    author: r.author == null ? null : String(r.author),
    fetched_at: String(r.fetched_at),
    summary: r.summary == null ? null : String(r.summary),
    topics,
    relevance: Number(r.relevance ?? 0),
    bookmarked,
  }
}

const ART_COLS = 'article_id, feed_source, title, link_url, score, comment_count, subreddit, author, fetched_at, summary, relevance'

/** Topics for a set of articles, one query, grouped in JS (no join available). */
async function topicsFor(articleIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (articleIds.length === 0) return out
  const list = articleIds.map(a => `'${safeArticleId(a)}'`).join(',')
  const rows = await zcql<Record<string, unknown>>(
    `SELECT article_id, topic FROM ${T_TOPIC} WHERE article_id IN (${list})`, T_TOPIC,
  )
  for (const r of rows) {
    const k = String(r.article_id)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(String(r.topic))
  }
  return out
}

/** The caller's bookmarked article ids. Replaces the LEFT JOIN. */
async function bookmarkedIds(owner: string): Promise<Set<string>> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT article_id FROM ${T_UA} WHERE user_id = '${owner}' AND bookmarked = 1`, T_UA,
  )
  return new Set(rows.map(r => String(r.article_id)))
}

// ── Global content writes (unscoped by design) ──────────────────────────────

/**
 * Bulk upsert. The obvious per-article loop costs 3+ round trips each (read,
 * write, topic delete, one insert per topic), which for a ~175-article refresh is
 * 500+ sequential calls — far past the AppSail request timeout. This batches into
 * a handful of calls regardless of article count:
 *
 *   1 read of existing ids -> 1 bulk update + 1 bulk insert
 *   1 bulk topic delete    -> 1 bulk topic insert
 *
 * Chunked because bulk endpoints cap how many rows they accept per call.
 */
const BULK = 100

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function upsertArticles(rawArticles: RawArticle[]): Promise<void> {
  // Deduplicate by id before writing. Turso absorbed repeats via ON CONFLICT DO
  // UPDATE; Cloud Scale has no such clause and fails the ENTIRE batch with 409
  // DUPLICATE_VALUE if one id repeats. Fetchers dedupe their own feeds, but this
  // is the layer that must not be corrupted by a single upstream slip, and last
  // occurrence wins so a fresher copy of the same article replaces an earlier one.
  const byId = new Map<string, RawArticle>()
  for (const a of rawArticles) byId.set(a.id, a)
  const articles = [...byId.values()]

  if (articles.length === 0) return
  const ds = (await catalystApp()).datastore()
  const table = ds.table(T_ART)
  const topicTable = ds.table(T_TOPIC)

  // 1. Which of these already exist? (chunked: the IN list has a length limit)
  const rowIdByArticle = new Map<string, string>()
  for (const part of chunk(articles, BULK)) {
    const ids = part.map(a => `'${safeArticleId(a.id)}'`).join(',')
    const existing = await zcql<Record<string, unknown>>(
      `SELECT ROWID, article_id FROM ${T_ART} WHERE article_id IN (${ids})`, T_ART,
    )
    for (const r of existing) rowIdByArticle.set(String(r.article_id), String(r.ROWID))
  }

  const toUpdate: Record<string, unknown>[] = []
  const toInsert: Record<string, unknown>[] = []
  for (const a of articles) {
    const base = {
      feed_source: a.source, title: a.title.slice(0, 255), link_url: a.url,
      score: a.score, comment_count: a.comment_count,
      // Sliced to the declared varchar widths — one over-long RSS author string
      // would otherwise fail the whole batch.
      subreddit: a.subreddit?.slice(0, 64) ?? null, author: a.author?.slice(0, 128) ?? null,
      fetched_at: a.fetched_at, relevance: a.relevance ?? (a.topics?.length ?? 0),
    }
    const rowId = rowIdByArticle.get(a.id)
    // Mirrors Turso's ON CONFLICT DO UPDATE: refresh volatile fields, keep summary.
    if (rowId) toUpdate.push({ ROWID: rowId, ...base })
    else toInsert.push({ article_id: a.id, ...base })
  }

  for (const part of chunk(toUpdate, BULK)) await table.updateRows(part as never)
  for (const part of chunk(toInsert, BULK)) await table.insertRows(part as never)

  // 2. Topics are replaced wholesale, in bulk rather than per article.
  const withTopics = articles.filter(a => (a.topics?.length ?? 0) > 0)
  for (const part of chunk(articles, BULK)) {
    const ids = part.map(a => `'${safeArticleId(a.id)}'`).join(',')
    await zcql(`DELETE FROM ${T_TOPIC} WHERE article_id IN (${ids})`, T_TOPIC)
  }
  const topicRows = withTopics.flatMap(a =>
    (a.topics ?? []).map(t => ({ uk: `${a.id}|${safeTopic(t)}`, article_id: a.id, topic: t })),
  )
  for (const part of chunk(topicRows, BULK)) await topicTable.insertRows(part as never)
}

export async function getSummary(id: string): Promise<string | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT summary FROM ${T_ART} WHERE article_id = '${safeArticleId(id)}'`, T_ART,
  )
  return rows.length && rows[0].summary != null ? String(rows[0].summary) : null
}

export async function cacheSummary(id: string, summary: string): Promise<void> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_ART} WHERE article_id = '${safeArticleId(id)}'`, T_ART,
  )
  if (rows.length === 0) return
  await (await catalystApp()).datastore().table(T_ART).updateRow({
    ROWID: String(rows[0].ROWID), summary: summary.slice(0, 10000),
  } as never)
}

export async function setArticleEmbedding(id: string, embedding: number[]): Promise<void> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_ART} WHERE article_id = '${safeArticleId(id)}'`, T_ART,
  )
  if (rows.length === 0) return
  await (await catalystApp()).datastore().table(T_ART).updateRow({
    ROWID: String(rows[0].ROWID), embedding: quantiseEmbedding(embedding),
  } as never)
}

/**
 * Deletes articles NO tenant has bookmarked. Unscoped by design — one user's
 * refresh must not delete an article another user has saved. Without a join, the
 * bookmarked set is read first and excluded in JS.
 */
export async function clearNonBookmarkedArticles(): Promise<void> {
  const kept = await zcql<Record<string, unknown>>(
    `SELECT article_id FROM ${T_UA} WHERE bookmarked = 1`, T_UA,
  )
  const keep = new Set(kept.map(r => String(r.article_id)))
  const all = await zcql<Record<string, unknown>>(`SELECT ROWID, article_id FROM ${T_ART}`, T_ART)
  const doomed = all.filter(r => !keep.has(String(r.article_id)))
  if (doomed.length === 0) return
  // Chunked: a full refresh clears ~175 rows and the bulk endpoint caps how many
  // ids it accepts per call.
  const table = (await catalystApp()).datastore().table(T_ART)
  for (const part of chunk(doomed, BULK)) {
    await table.deleteRows(part.map(r => String(r.ROWID)))
  }
}

// ── Per-user reads and bookmark state ───────────────────────────────────────

export async function getArticles(userId: string, source: string, limit: number): Promise<Article[]> {
  const owner = safeUserId(userId)
  const cap = Math.min(limit, 200)
  const where = source === 'all'
    ? ''
    : ` AND feed_source = '${safeTopic(source)}'`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS} FROM ${T_ART} WHERE relevance >= 0${where}
     ORDER BY relevance DESC, fetched_at DESC, score DESC LIMIT ${cap * 2}`, T_ART,
  )
  const marked = await bookmarkedIds(owner)
  const visible = rows.filter(r => !marked.has(String(r.article_id))).slice(0, cap)
  const topics = await topicsFor(visible.map(r => String(r.article_id)))
  return visible.map(r => toArticle(r, topics.get(String(r.article_id)) ?? [], 0))
}

/** Topic filtering via the article_topics side table instead of json_each. */
export async function getArticlesByTopics(
  userId: string, topics: string[], source: string, limit: number,
): Promise<Article[]> {
  const owner = safeUserId(userId)
  const cap = Math.min(limit, 200)
  if (topics.length === 0) return []
  const list = topics.map(t => `'${safeTopic(t)}'`).join(',')
  const matching = await zcql<Record<string, unknown>>(
    `SELECT article_id FROM ${T_TOPIC} WHERE topic IN (${list})`, T_TOPIC,
  )
  const ids = [...new Set(matching.map(r => String(r.article_id)))]
  if (ids.length === 0) return []

  const marked = await bookmarkedIds(owner)
  const wanted = ids.filter(i => !marked.has(i)).slice(0, 200)
  if (wanted.length === 0) return []

  const where = source === 'all' ? '' : ` AND feed_source = '${safeTopic(source)}'`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS} FROM ${T_ART}
     WHERE article_id IN (${wanted.map(i => `'${safeArticleId(i)}'`).join(',')})${where}
     ORDER BY relevance DESC, fetched_at DESC, score DESC LIMIT ${cap}`, T_ART,
  )
  const topicMap = await topicsFor(rows.map(r => String(r.article_id)))
  return rows.map(r => toArticle(r, topicMap.get(String(r.article_id)) ?? [], 0))
}

export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  const owner = safeUserId(userId)
  const marked = [...await bookmarkedIds(owner)]
  if (marked.length === 0) return []
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS} FROM ${T_ART}
     WHERE article_id IN (${marked.map(i => `'${safeArticleId(i)}'`).join(',')})
     ORDER BY fetched_at DESC`, T_ART,
  )
  const topicMap = await topicsFor(rows.map(r => String(r.article_id)))
  return rows.map(r => toArticle(r, topicMap.get(String(r.article_id)) ?? [], 1))
}

/** Upsert into user_articles keyed on the synthetic uk column. */
export async function setBookmark(userId: string, articleId: string, bookmarked: boolean): Promise<void> {
  const owner = safeUserId(userId)
  const aid = safeArticleId(articleId)
  const uk = `${owner}|${aid}`
  const existing = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_UA} WHERE uk = '${uk}'`, T_UA,
  )
  const table = (await catalystApp()).datastore().table(T_UA)
  if (existing.length > 0) {
    await table.updateRow({ ROWID: String(existing[0].ROWID), bookmarked: bookmarked ? 1 : 0 } as never)
    return
  }
  await table.insertRow({
    uk, user_id: owner, article_id: aid,
    bookmarked: bookmarked ? 1 : 0, created_at: new Date().toISOString(),
  })
}

export async function deleteBookmark(userId: string, articleId: string): Promise<void> {
  await setBookmark(userId, articleId, false)
}

export async function getArticlesForSearch(
  userId: string,
): Promise<(Article & { embedding: number[] | null })[]> {
  const owner = safeUserId(userId)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS}, embedding FROM ${T_ART} ORDER BY fetched_at DESC, score DESC`, T_ART,
  )
  const marked = await bookmarkedIds(owner)
  const visible = rows.filter(r => !marked.has(String(r.article_id)))
  const topicMap = await topicsFor(visible.map(r => String(r.article_id)))
  return visible.map(r => {
    let embedding: number[] | null = null
    if (r.embedding) {
      try { embedding = JSON.parse(String(r.embedding)) as number[] } catch { embedding = null }
    }
    return { ...toArticle(r, topicMap.get(String(r.article_id)) ?? [], 0), embedding }
  })
}
