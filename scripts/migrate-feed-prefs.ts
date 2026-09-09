// One-shot, DESTRUCTIVE migration to per-tenant articles.
//
// `articles` and `article_topics` gain a user_id and a composite key, and
// `summary`/`embedding` move out of the article row into global tables. SQLite
// cannot add a column to a primary key in place, so the tables are dropped and
// let initSchema() recreate them in the new shape.
//
// This is deliberately NOT part of ensureInit(): that runs on every boot, and a
// DROP there would destroy live data on every redeploy. Same reasoning as
// scripts/migrate-tenancy.ts, which this mirrors.
//
// WHAT IS LOST: the entire article pool. That is by design — a refresh replaces
// it anyway, so the cost is one Refresh click per tenant. `user_articles` is
// PRESERVED, so bookmark rows survive; they will reference article rows that no
// longer exist until the owning tenant refreshes, at which point any still in
// the feed window come back. Nothing else is touched.
//
// TURSO ONLY. Catalyst Cloud Scale tables are created and altered through the
// Catalyst console or the Datastore API, not by DDL from application code — see
// docs for the column list to apply there.
//
// Run with:  npm run migrate:feed-prefs -- --yes-drop-articles
import { client, getUserById } from '../lib/db'

const DROP = ['articles', 'article_topics']

async function main() {
  if (!process.argv.includes('--yes-drop-articles')) {
    console.error('Refusing to run without --yes-drop-articles.')
    console.error('')
    console.error('This PERMANENTLY DELETES every article row and its topic tags.')
    console.error('Bookmarks (user_articles) and all other data are preserved.')
    console.error('Each tenant repopulates their feed on their next Refresh.')
    process.exit(1)
  }

  // ORDER MATTERS. ensureInit() memoizes its promise, so initSchema() runs at
  // most ONCE per process — a getUserById() before the drops would consume that
  // one run on the old schema and leave the tables gone. So: drop through the
  // raw `client` export (which bypasses init), and only then make a db call to
  // trigger the single initSchema() that recreates them in the new shape.
  for (const table of DROP) {
    const before = await count(table)
    await client.execute(`DROP TABLE IF EXISTS ${table}`)
    console.log(`dropped ${table}${before === null ? '' : ` (${before} rows)`}`)
  }

  // Old single-column indexes reference the dropped table; SQLite removes them
  // with it, but the names would collide if a stale database somehow kept them.
  for (const idx of ['idx_source', 'idx_fetched_at']) {
    await client.execute(`DROP INDEX IF EXISTS ${idx}`)
  }

  const bookmarks = await count('user_articles')
  console.log(`preserved user_articles (${bookmarks ?? 0} rows)`)

  // The one initSchema() run, now that the old tables are gone.
  await getUserById('trigger-schema-init')

  // Prove the new shape actually took rather than assuming it.
  await client.execute(`SELECT user_id, id FROM articles LIMIT 1`)
  await client.execute(`SELECT article_id, summary FROM article_summaries LIMIT 1`)
  await client.execute(`SELECT article_id, embedding FROM article_embeddings LIMIT 1`)
  await client.execute(`SELECT user_id, sources, topics FROM user_feed_prefs LIMIT 1`)

  console.log('')
  console.log('Done. articles is now per-tenant; summaries and embeddings are global.')
  console.log('Each tenant should hit Refresh in Thagaval to repopulate their feed.')
}

async function count(table: string): Promise<number | null> {
  try {
    const r = await client.execute(`SELECT COUNT(*) FROM ${table}`)
    return Number(r.rows[0][0])
  } catch {
    return null   // table does not exist yet
  }
}

main().catch(e => { console.error(e); process.exit(1) })
