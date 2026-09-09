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
//    `uk` column holding `user_id|article_id`, which is the unique one. Since
//    articles themselves are per-tenant now, articles AND article_topics both
//    need it: without user_id in article_topics.uk, two tenants holding the same
//    article collide on topic insert and the whole batch 409s.
//
// 4. text CAPS AT 10000 CHARS, and a full-precision 768-dim nomic-embed-text
//    embedding serialises to ~16,585 — it does NOT fit. Embeddings are stored
//    quantised to 4 decimal places (~5,753 chars). Cosine similarity is robust to
//    that precision; storing full precision would silently truncate.
//
// Column renames (mapped back here so callers keep the app's shape):
//   source -> feed_source, url -> link_url, id -> article_id
//
// PER-TENANT vs GLOBAL, which is the whole shape of this file:
//
//   articles, article_topics  -> PER-TENANT. Each tenant's refresh pulls only
//        their subscribed sources/topics and rebuilds only their own rows, so a
//        narrow subscription cannot empty anyone else's feed.
//   article_summaries, article_embeddings -> GLOBAL, keyed on article_id alone.
//        Both derive purely from public article text and are identical for every
//        reader, so duplicating them per tenant would multiply the AI bill by the
//        tenant count for nothing. The tenant who triggers the LLM call pays for
//        it once on everyone's behalf.
//   user_articles -> PER-TENANT bookmark state, unchanged.
import type { Article, RawArticle } from './types'
import { zcql, catalystApp, safeUserId } from './catalyst'

const T_ART = 'articles'
const T_TOPIC = 'article_topics'
const T_UA = 'user_articles'
const T_SUM = 'article_summaries'
const T_EMB = 'article_embeddings'

/**
 * The synthetic unique keys standing in for composite primary keys.
 *
 * Every part must already be through safeUserId/safeArticleId/safeTopic — these
 * are inlined into ZCQL, which cannot bind parameters.
 *
 * THE LENGTH CHECK IS NOT PARANOIA. Catalyst truncates an over-long varchar
 * SILENTLY, and a truncated uk is not a lost character — it is two distinct
 * keys collapsing into one, which either 409s the whole batch or, worse, makes
 * one tenant's upsert update another's row. Worst cases: articles is
 * 36 (uuid) + 1 + 128 (article_id) = 165; article_topics adds 1 + 64 (topic)
 * = 230. Both fit varchar(255), with little headroom — so if either input cap
 * ever widens, this throws instead of corrupting.
 */
const UK_MAX = 255

function checkedUk(uk: string, kind: string): string {
  if (uk.length > UK_MAX) {
    throw new Error(`${kind} uk exceeds ${UK_MAX} chars (${uk.length}) and would truncate silently: ${uk.slice(0, 80)}…`)
  }
  return uk
}

function artUk(owner: string, articleId: string): string {
  return checkedUk(`${owner}|${articleId}`, 'articles')
}

function topicUk(owner: string, articleId: string, topic: string): string {
  return checkedUk(`${owner}|${articleId}|${topic}`, 'article_topics')
}

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

function toArticle(
  r: Record<string, unknown>, topics: string[], bookmarked = 0, summary: string | null = null,
): Article {
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
    // From the global article_summaries table, merged in by the caller — there
    // is no summary column on the tenant row and no JOIN to fetch it with.
    summary,
    topics,
    relevance: Number(r.relevance ?? 0),
    bookmarked,
  }
}

const ART_COLS = 'article_id, feed_source, title, link_url, score, comment_count, subreddit, author, fetched_at, relevance'

/**
 * Topics for a set of the CALLER'S articles, one query, grouped in JS (no join).
 *
 * Scoped by user_id: article_topics is per-tenant, so an unscoped read would mix
 * another tenant's topic rows for the same article id into this tenant's labels.
 */
async function topicsFor(owner: string, articleIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (articleIds.length === 0) return out
  const list = articleIds.map(a => `'${safeArticleId(a)}'`).join(',')
  const rows = await zcql<Record<string, unknown>>(
    `SELECT article_id, topic FROM ${T_TOPIC}
     WHERE user_id = '${owner}' AND article_id IN (${list})`, T_TOPIC,
  )
  for (const r of rows) {
    const k = String(r.article_id)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(String(r.topic))
  }
  return out
}

/**
 * Summaries for a set of articles. Global, so deliberately NOT scoped by tenant:
 * inheriting another tenant's cached summary is the point.
 */
async function summariesFor(articleIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (articleIds.length === 0) return out
  for (const part of chunk(articleIds, BULK)) {
    const list = part.map(a => `'${safeArticleId(a)}'`).join(',')
    const rows = await zcql<Record<string, unknown>>(
      `SELECT article_id, summary FROM ${T_SUM} WHERE article_id IN (${list})`, T_SUM,
    )
    for (const r of rows) {
      if (r.summary != null) out.set(String(r.article_id), String(r.summary))
    }
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

// ── Per-tenant content writes ───────────────────────────────────────────────

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

export async function upsertArticles(userId: string, rawArticles: RawArticle[]): Promise<void> {
  const owner = safeUserId(userId)
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

  // 1. Which of these already exist FOR THIS TENANT? Probing on article_id alone
  // would find another tenant's row and update it instead of inserting ours, so
  // the probe is on the composite uk. (Chunked: the IN list has a length limit.)
  const rowIdByArticle = new Map<string, string>()
  for (const part of chunk(articles, BULK)) {
    const uks = part.map(a => `'${artUk(owner, safeArticleId(a.id))}'`).join(',')
    const existing = await zcql<Record<string, unknown>>(
      `SELECT ROWID, article_id FROM ${T_ART} WHERE uk IN (${uks})`, T_ART,
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
    // Mirrors Turso's ON CONFLICT DO UPDATE, refreshing volatile fields. There is
    // no longer a summary column to preserve — summaries moved to the global
    // article_summaries table and survive a refresh untouched.
    if (rowId) toUpdate.push({ ROWID: rowId, ...base })
    else toInsert.push({ uk: artUk(owner, a.id), user_id: owner, article_id: a.id, ...base })
  }

  for (const part of chunk(toUpdate, BULK)) await table.updateRows(part as never)
  for (const part of chunk(toInsert, BULK)) await table.insertRows(part as never)

  // 2. Topics are replaced wholesale, in bulk rather than per article. Scoped to
  // this tenant on both the delete and the key, or one tenant's refresh would
  // strip another tenant's topic labels for the same article.
  const withTopics = articles.filter(a => (a.topics?.length ?? 0) > 0)
  for (const part of chunk(articles, BULK)) {
    const ids = part.map(a => `'${safeArticleId(a.id)}'`).join(',')
    await zcql(
      `DELETE FROM ${T_TOPIC} WHERE user_id = '${owner}' AND article_id IN (${ids})`, T_TOPIC,
    )
  }
  const topicRows = withTopics.flatMap(a =>
    (a.topics ?? []).map(t => ({
      uk: topicUk(owner, a.id, safeTopic(t)), user_id: owner, article_id: a.id, topic: t,
    })),
  )
  for (const part of chunk(topicRows, BULK)) await topicTable.insertRows(part as never)
}

export async function getSummary(id: string): Promise<string | null> {
  const rows = await zcql<Record<string, unknown>>(
    `SELECT summary FROM ${T_SUM} WHERE article_id = '${safeArticleId(id)}'`, T_SUM,
  )
  return rows.length && rows[0].summary != null ? String(rows[0].summary) : null
}

/**
 * Upserts into the GLOBAL summary table, so a summary outlives the tenant row it
 * was generated for and is inherited by the next tenant to open that article.
 */
export async function cacheSummary(id: string, summary: string): Promise<void> {
  const aid = safeArticleId(id)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_SUM} WHERE article_id = '${aid}'`, T_SUM,
  )
  const table = (await catalystApp()).datastore().table(T_SUM)
  if (rows.length > 0) {
    await table.updateRow({ ROWID: String(rows[0].ROWID), summary: summary.slice(0, 10000) } as never)
    return
  }
  await table.insertRow({
    article_id: aid, summary: summary.slice(0, 10000), created_at: new Date().toISOString(),
  })
}

export async function setArticleEmbedding(id: string, embedding: number[]): Promise<void> {
  const aid = safeArticleId(id)
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ROWID FROM ${T_EMB} WHERE article_id = '${aid}'`, T_EMB,
  )
  const table = (await catalystApp()).datastore().table(T_EMB)
  if (rows.length > 0) {
    await table.updateRow({
      ROWID: String(rows[0].ROWID), embedding: quantiseEmbedding(embedding),
    } as never)
    return
  }
  await table.insertRow({
    article_id: aid, embedding: quantiseEmbedding(embedding), created_at: new Date().toISOString(),
  })
}

/**
 * Deletes the CALLER'S non-bookmarked rows, ahead of their refresh rewriting them.
 *
 * Scoped to one tenant, unlike the global version this replaced: a refresh now
 * pulls only the caller's subscribed sources and topics, so an unscoped delete
 * would let one tenant's narrow subscription wipe every other tenant's feed.
 * Without a join, the caller's bookmarked set is read first and excluded in JS.
 */
export async function clearNonBookmarkedArticles(userId: string): Promise<void> {
  const owner = safeUserId(userId)
  const keep = await bookmarkedIds(owner)
  const all = await zcql<Record<string, unknown>>(
    `SELECT ROWID, article_id FROM ${T_ART} WHERE user_id = '${owner}'`, T_ART,
  )
  const doomed = all.filter(r => !keep.has(String(r.article_id)))
  if (doomed.length === 0) return
  // Chunked: a full refresh clears ~175 rows and the bulk endpoint caps how many
  // ids it accepts per call.
  const table = (await catalystApp()).datastore().table(T_ART)
  for (const part of chunk(doomed, BULK)) {
    await table.deleteRows(part.map(r => String(r.ROWID)))
  }

  // Topic rows are NOT cascaded by the datastore. Left behind they would keep
  // matching in getArticlesByTopics, which resolves ids from article_topics
  // first — producing phantom ids for articles that no longer exist.
  for (const part of chunk(doomed, BULK)) {
    const ids = part.map(r => `'${safeArticleId(String(r.article_id))}'`).join(',')
    await zcql(
      `DELETE FROM ${T_TOPIC} WHERE user_id = '${owner}' AND article_id IN (${ids})`, T_TOPIC,
    )
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
    `SELECT ${ART_COLS} FROM ${T_ART} WHERE user_id = '${owner}'${where}
     ORDER BY relevance DESC, fetched_at DESC, score DESC LIMIT ${cap * 2}`, T_ART,
  )
  const marked = await bookmarkedIds(owner)
  const visible = rows.filter(r => !marked.has(String(r.article_id))).slice(0, cap)
  const ids = visible.map(r => String(r.article_id))
  const [topics, summaries] = await Promise.all([topicsFor(owner, ids), summariesFor(ids)])
  return visible.map(r => toArticle(
    r, topics.get(String(r.article_id)) ?? [], 0, summaries.get(String(r.article_id)) ?? null,
  ))
}

/** Topic filtering via the article_topics side table instead of json_each. */
export async function getArticlesByTopics(
  userId: string, topics: string[], source: string, limit: number,
): Promise<Article[]> {
  const owner = safeUserId(userId)
  const cap = Math.min(limit, 200)
  // Same fallback as the Turso implementation. Kept identical deliberately: the
  // facade's pick() enforces SIGNATURE parity but nothing enforces behavioural
  // parity, and only the Turso path is reachable from the test suite — so a
  // divergence here would be invisible until it hit production.
  if (topics.length === 0) return getArticles(userId, source, limit)
  const list = topics.map(t => `'${safeTopic(t)}'`).join(',')
  const matching = await zcql<Record<string, unknown>>(
    `SELECT article_id FROM ${T_TOPIC} WHERE user_id = '${owner}' AND topic IN (${list})`, T_TOPIC,
  )
  const ids = [...new Set(matching.map(r => String(r.article_id)))]
  if (ids.length === 0) return []

  const marked = await bookmarkedIds(owner)
  const wanted = ids.filter(i => !marked.has(i)).slice(0, 200)
  if (wanted.length === 0) return []

  const where = source === 'all' ? '' : ` AND feed_source = '${safeTopic(source)}'`
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS} FROM ${T_ART}
     WHERE user_id = '${owner}'
       AND article_id IN (${wanted.map(i => `'${safeArticleId(i)}'`).join(',')})${where}
     ORDER BY relevance DESC, fetched_at DESC, score DESC LIMIT ${cap}`, T_ART,
  )
  const ids2 = rows.map(r => String(r.article_id))
  const [topicMap, summaries] = await Promise.all([topicsFor(owner, ids2), summariesFor(ids2)])
  return rows.map(r => toArticle(
    r, topicMap.get(String(r.article_id)) ?? [], 0, summaries.get(String(r.article_id)) ?? null,
  ))
}

export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  const owner = safeUserId(userId)
  const marked = [...await bookmarkedIds(owner)]
  if (marked.length === 0) return []
  const rows = await zcql<Record<string, unknown>>(
    `SELECT ${ART_COLS} FROM ${T_ART}
     WHERE user_id = '${owner}'
       AND article_id IN (${marked.map(i => `'${safeArticleId(i)}'`).join(',')})
     ORDER BY fetched_at DESC`, T_ART,
  )
  const ids = rows.map(r => String(r.article_id))
  const [topicMap, summaries] = await Promise.all([topicsFor(owner, ids), summariesFor(ids)])
  return rows.map(r => toArticle(
    r, topicMap.get(String(r.article_id)) ?? [], 1, summaries.get(String(r.article_id)) ?? null,
  ))
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
    `SELECT ${ART_COLS} FROM ${T_ART} WHERE user_id = '${owner}'
     ORDER BY fetched_at DESC, score DESC`, T_ART,
  )
  const marked = await bookmarkedIds(owner)
  const visible = rows.filter(r => !marked.has(String(r.article_id)))
  const ids = visible.map(r => String(r.article_id))
  const [topicMap, summaries, embeddings] = await Promise.all([
    topicsFor(owner, ids), summariesFor(ids), embeddingsFor(ids),
  ])
  return visible.map(r => {
    const aid = String(r.article_id)
    return {
      ...toArticle(r, topicMap.get(aid) ?? [], 0, summaries.get(aid) ?? null),
      embedding: embeddings.get(aid) ?? null,
    }
  })
}

/**
 * Embeddings for a set of articles, from the global table. Like summaries these
 * are shared across tenants — an embedding costs a model call and the vector for
 * a given title is the same for everybody.
 */
async function embeddingsFor(articleIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  if (articleIds.length === 0) return out
  for (const part of chunk(articleIds, BULK)) {
    const list = part.map(a => `'${safeArticleId(a)}'`).join(',')
    const rows = await zcql<Record<string, unknown>>(
      `SELECT article_id, embedding FROM ${T_EMB} WHERE article_id IN (${list})`, T_EMB,
    )
    for (const r of rows) {
      if (!r.embedding) continue
      try { out.set(String(r.article_id), JSON.parse(String(r.embedding)) as number[]) } catch {}
    }
  }
  return out
}
