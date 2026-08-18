// One-shot, DESTRUCTIVE migration to the multi-tenant schema.
//
// Drops the data tables so initSchema() recreates them with user_id. This is
// deliberately NOT part of ensureInit(): that runs on every boot, and a DROP
// there would destroy live data on every redeploy.
//
// `users` is NEVER dropped — it holds the tenant identity that every other
// table now references. Dropping it would orphan every account and silently
// hand the owner a fresh empty workspace on next login.
//
// Run with:  npm run migrate:tenancy -- --yes-drop-everything
import { client, getUserById } from '../lib/db'

const DATA_TABLES = [
  'articles', 'user_articles', 'todos', 'nyabagam', 'notes',
  'finance_transactions', 'finance_budgets', 'push_subscriptions',
  'urai_conversations', 'urai_messages',
  'vault_meta', 'vault_items', 'vault_folders',
]

async function main() {
  if (!process.argv.includes('--yes-drop-everything')) {
    console.error('Refusing to run without --yes-drop-everything.')
    console.error('')
    console.error('This PERMANENTLY DELETES all notes, todos, reminders,')
    console.error('transactions, budgets, conversations, and vault entries.')
    console.error('The `users` table is preserved.')
    process.exit(1)
  }

  let before: number
  try {
    const r = await client.execute(`SELECT id, email FROM users`)
    before = r.rows.length
    console.log(`Preserving ${before} user(s):`)
    for (const row of r.rows) console.log(`  ${row[0]}  ${row[1]}`)
  } catch {
    // users does not exist yet (nobody has logged in since Plan 1 shipped).
    before = 0
    console.log('No users table yet — it will be created by initSchema().')
  }

  for (const t of DATA_TABLES) {
    await client.execute(`DROP TABLE IF EXISTS ${t}`)
    console.log(`dropped ${t}`)
  }

  // Any db call triggers ensureInit(), which recreates the new shape.
  await getUserById('trigger-schema-init')

  const after = await client.execute(`SELECT id FROM users`)
  console.log(`Done. ${after.rows.length} user(s) present.`)
  if (after.rows.length !== before) {
    throw new Error(
      `users went from ${before} to ${after.rows.length} rows — that is a bug, investigate before using the app`,
    )
  }
}

main().catch(e => { console.error(e); process.exit(1) })
