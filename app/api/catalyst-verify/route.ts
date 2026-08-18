// TEMPORARY diagnostic route for the Cloud Scale notes spike.
//
// Exists to prove, from inside AppSail, that:
//   1. the platform injects CATALYST_CONFIG / CATALYST_AUTH (so the SDK
//      self-authenticates and no OAuth client is needed), and
//   2. the ported notes functions work against the live datastore, including
//      cross-tenant isolation.
//
// Locally none of this can be verified: the CLI's credential is encrypted at a
// path the SDK does not read, and RefreshTokenCredential needs a client id and
// secret we do not have. On AppSail that problem disappears.
//
// Gated behind CRON_SECRET so it is not publicly callable. DELETE THIS ROUTE
// once the spike question is settled — it writes to the datastore.
import { NextRequest, NextResponse } from 'next/server'
import { getNotes, getNote, createNote, updateNote, deleteNote } from '@/lib/notes-catalyst'
import {
  getTodos, getTodosByDate, getAgendaTodos, getDatesWithTodos,
  createTodo, updateTodo, deleteTodo,
  getNyabagamByDate, getUpcomingNyabagam, getDatesWithNyabagam,
  createNyabagam, deleteNyabagam,
} from '@/lib/todos-catalyst'
import {
  listConversations, getConversation, createConversation, renameConversation,
  deleteConversation, getMessages, addMessage,
} from '@/lib/urai-catalyst'
import {
  getVaultMeta, setVaultMeta, getVaultItems, createVaultItem, updateVaultItem,
  softDeleteVaultItem, restoreVaultItem, hardDeleteVaultItem,
  getVaultFolders, createVaultFolder, updateVaultFolder, softDeleteVaultFolder,
} from '@/lib/vault-catalyst'
import {
  upsertArticles, getArticles, getArticlesByTopics, getBookmarkedArticles,
  setBookmark, deleteBookmark, getSummary, cacheSummary, clearNonBookmarkedArticles,
} from '@/lib/articles-catalyst'
import {
  createTransaction, getTransactions, getTransactionSummary, getMonthlyTotals,
  deleteTransaction, getImportSources, deleteTransactionsBySource,
  upsertBudget, getBudgets, deleteBudget,
} from '@/lib/finance-catalyst'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const A = 'verify-tenant-a'
const B = 'verify-tenant-b'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: { name: string; pass: boolean; detail?: string }[] = []
  const add = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail })

  // What the platform actually gives us — the whole reason this route exists.
  // NAMES ONLY — never values. Some of these would be credentials.
  const platform = {
    envKeys: Object.keys(process.env)
      .filter(k => /catalyst|zoho|^zc_|appsail/i.test(k)).sort(),
    headerNames: [...req.headers.keys()]
      .filter(h => /catalyst|zoho|zc-|ticket|auth/i.test(h)).sort(),
    hasConfig: !!process.env.CATALYST_CONFIG,
    hasAuth: !!process.env.CATALYST_AUTH,
    accountsUrl: process.env.X_ZOHO_CATALYST_ACCOUNTS_URL ?? '(unset until adapter runs)',
  }
  const env = platform

  try {
    // 1. create + read back
    const a1 = await createNote(A, 'A note one', '<p>A body one</p>')
    // Ids are self-generated uuids now, never ROWIDs — so they cannot be rounded
    // by JSON.parse and are byte-identical on Turso and Catalyst.
    add('createNote returns a uuid id',
        /^[0-9a-fA-F-]{36}$/.test(a1.id), `id=${a1.id}`)
    add('id is not a ROWID (immune to the rounding bug)', !/^\d+$/.test(a1.id))
    const got = await getNote(A, a1.id)
    add('getNote round-trips title', got?.title === 'A note one', got?.title)
    add('getNote round-trips content', got?.content === '<p>A body one</p>')

    // 2. the injection case: content full of quotes and SQL metacharacters.
    // ZCQL cannot bind parameters, which is why writes go through the
    // object-based row API instead of an interpolated string.
    const nasty = `<p>it's "quoted" '; DROP TABLE notes; --</p>`
    const a2 = await createNote(A, `O'Brien's note`, nasty)
    const back = await getNote(A, a2.id)
    add('quoted/SQL-ish content survives verbatim', back?.content === nasty, back?.content?.slice(0, 50))
    add('quoted title survives', back?.title === `O'Brien's note`)

    // 3. list scoped to the caller
    const b1 = await createNote(B, 'B private', '<p>B SECRET</p>')
    const aList = await getNotes(A)
    add('A list contains only A rows', aList.every(n => n.user_id === A), `${aList.length} rows`)

    // 4. cross-tenant read
    add('A cannot read B row', (await getNote(A, b1.id)) === null)

    // 5. cross-tenant write
    await updateNote(A, b1.id, { title: 'HACKED', content: 'HACKED' })
    const bAfter = await getNote(B, b1.id)
    add('B title untouched by A update', bAfter?.title === 'B private', bAfter?.title)
    add('B content untouched by A update', bAfter?.content === '<p>B SECRET</p>')

    // 6. cross-tenant delete
    await deleteNote(A, b1.id)
    add('B row survives A delete', (await getNote(B, b1.id)) !== null)

    // 7. controls — proving 4-6 are the guard working, not broken SQL
    await updateNote(A, a1.id, { title: 'A note one EDITED' })
    add('CONTROL own update applies', (await getNote(A, a1.id))?.title === 'A note one EDITED')
    await deleteNote(A, a1.id)
    add('CONTROL own delete applies', (await getNote(A, a1.id)) === null)

    // 8. fail closed
    let threw = false
    try { await getNotes('') } catch { threw = true }
    add('empty userId throws', threw)

    // ── todos + reminders ────────────────────────────────────────────────
    // The valuable checks here are the workarounds for ZCQL's missing features:
    // likePrefix (because % silently matches nothing) and substr-free date
    // handling. A regression in either returns an EMPTY LIST, not an error.
    const t1 = await createTodo(A, 'A todo', 'desc', 'high', '2026-08-18T00:00:00.000Z')
    add('createTodo returns a uuid', /^[0-9a-fA-F-]{36}$/.test(t1.id), `id=${t1.id}`)
    add('priority round-trips despite the reserved column name', t1.priority === 'high')

    const aTodos = await getTodos(A)
    add('todo list is tenant-scoped', aTodos.length === 1 && aTodos[0].user_id === A, `${aTodos.length} rows`)

    const byDate = await getTodosByDate(A, '2026-08-18')
    add('getTodosByDate finds it (proves likePrefix, not %)', byDate.length === 1, `${byDate.length} rows`)

    const dots = await getDatesWithTodos(A, 2026, 8)
    add('calendar dots extract day 18 without substr', dots.includes(18), JSON.stringify(dots))

    const agenda = await getAgendaTodos(A, '2026-08-18')
    add('agenda includes the open todo', agenda.some(t => t.id === t1.id), `${agenda.length} rows`)

    await updateTodo(A, t1.id, { done: 1, completed_at: '2026-08-18T12:00:00.000Z' })
    add('CONTROL own todo update applies', (await getTodos(A))[0].done === 1)

    const r1 = await createNyabagam(A, 'A reminder', null, '2026-08-20T09:00:00.000Z')
    const upcoming = await getUpcomingNyabagam(A, '2026-08-18', 14)
    add('getUpcomingNyabagam finds it via ISO range compare',
        upcoming.some(r => r.id === r1.id), `${upcoming.length} rows`)
    add('getNyabagamByDate finds it (likePrefix)',
        (await getNyabagamByDate(A, '2026-08-20')).length === 1)
    const rDots = await getDatesWithNyabagam(A, 2026, 8)
    add('reminder dots extract day 20', rDots.includes(20), JSON.stringify(rDots))

    const bTodo = await createTodo(B, 'B todo', null, 'low', null)
    add('B todo invisible to A', (await getTodos(A)).every(t => t.user_id === A))
    await updateTodo(A, bTodo.id, { title: 'HACKED', done: 1 })
    const bAfterTodo = (await getTodos(B)).find(t => t.id === bTodo.id)
    add('B todo untouched by A update',
        bAfterTodo?.title === 'B todo' && bAfterTodo?.done === 0, bAfterTodo?.title)
    await deleteTodo(A, bTodo.id)
    add('B todo survives A delete', (await getTodos(B)).some(t => t.id === bTodo.id))

    await deleteTodo(A, t1.id); await deleteNyabagam(A, r1.id); await deleteTodo(B, bTodo.id)
    add('todo/reminder cleanup complete',
      (await getTodos(A)).length === 0 && (await getTodos(B)).length === 0)

    // ── urai ─────────────────────────────────────────────────────────────
    const c1 = await createConversation(A, 'A chat')
    add('createConversation returns a uuid', /^[0-9a-fA-F-]{36}$/.test(c1.id))
    const m1 = await addMessage(A, c1.id, 'user', "A's message with 'quotes'", [{ title: 'src', url: 'https://x.test' }] as never)
    add('addMessage role round-trips despite msg_role column', m1.role === 'user')
    add('addMessage sources JSON round-trips',
        (await getMessages(A, c1.id))[0]?.sources?.[0]?.title === 'src')
    add('message content with quotes survives', (await getMessages(A, c1.id))[0]?.content === "A's message with 'quotes'")
    await renameConversation(A, c1.id, 'A renamed')
    add('CONTROL own rename applies', (await getConversation(A, c1.id))?.title === 'A renamed')

    const cB = await createConversation(B, 'B chat')
    await addMessage(B, cB.id, 'user', 'B secret')
    add('A cannot list B conversations', (await listConversations(A)).every(c => c.user_id === A))
    add('A cannot read B conversation', (await getConversation(A, cB.id)) === null)
    add('A cannot read B messages', (await getMessages(A, cB.id)).length === 0)
    await renameConversation(A, cB.id, 'HACKED')
    add('B conversation untouched by A rename', (await getConversation(B, cB.id))?.title === 'B chat')
    await deleteConversation(A, cB.id)
    add('B conversation survives A delete', (await getConversation(B, cB.id)) !== null)
    add('B messages survive A delete', (await getMessages(B, cB.id)).length === 1)

    // No cascade by design — deleteConversation must remove both, scoped.
    await deleteConversation(A, c1.id)
    add('own delete removes conversation AND its messages',
        (await getConversation(A, c1.id)) === null && (await getMessages(A, c1.id)).length === 0)

    // ── vault ────────────────────────────────────────────────────────────
    await setVaultMeta(A, { kdf_salt: 'a-salt', kdf_iterations: 600000, wrapped_dek: 'a-dek' })
    await setVaultMeta(B, { kdf_salt: 'b-salt', kdf_iterations: 600000, wrapped_dek: 'b-dek' })
    add('vault meta is per-tenant', (await getVaultMeta(A))?.wrapped_dek === 'a-dek'
        && (await getVaultMeta(B))?.wrapped_dek === 'b-dek')
    // setVaultMeta twice must UPDATE not duplicate (no ON CONFLICT on Catalyst)
    await setVaultMeta(A, { kdf_salt: 'a-salt2', kdf_iterations: 700000, wrapped_dek: 'a-dek2' })
    add('setVaultMeta upserts rather than duplicating', (await getVaultMeta(A))?.wrapped_dek === 'a-dek2')
    add('B key material unaffected by A upsert', (await getVaultMeta(B))?.wrapped_dek === 'b-dek')

    const vi = await createVaultItem(A, { id: randomUUID(), iv: 'iv', ciphertext: 'A-secret' })
    const viB = await createVaultItem(B, { id: randomUUID(), iv: 'iv', ciphertext: 'B-secret' })
    add('vault items are tenant-scoped', (await getVaultItems(A)).length === 1)
    await updateVaultItem(A, viB.id, 'hk', 'HACKED')
    add('B vault ciphertext untouched by A update',
        (await getVaultItems(B))[0]?.ciphertext === 'B-secret')
    await hardDeleteVaultItem(A, viB.id)
    add('B vault item survives A hard delete', (await getVaultItems(B)).length === 1)

    await softDeleteVaultItem(A, vi.id)
    add('soft delete hides the item (proves IS NULL filter)', (await getVaultItems(A)).length === 0)
    add('soft-deleted item visible with includeDeleted', (await getVaultItems(A, true)).length === 1)
    await restoreVaultItem(A, vi.id)
    add('CONTROL restore brings it back', (await getVaultItems(A)).length === 1)

    const vf = await createVaultFolder(A, { id: randomUUID(), parent_id: null, iv: 'iv', name_ct: 'ct', sort_order: 0 })
    await updateVaultFolder(A, vf.id, { sort_order: 3 })
    add('CONTROL own folder update applies', (await getVaultFolders(A))[0]?.sort_order === 3)
    await softDeleteVaultFolder(A, vf.id)
    add('folder soft delete hides it', (await getVaultFolders(A)).length === 0)

    // vault + urai cleanup
    await hardDeleteVaultItem(A, vi.id); await hardDeleteVaultItem(B, viB.id)
    await deleteConversation(B, cB.id)
    add('urai/vault cleanup complete',
      (await getVaultItems(A, true)).length === 0 && (await getVaultItems(B, true)).length === 0
      && (await listConversations(A)).length === 0 && (await listConversations(B)).length === 0)

    // ── articles (global content + per-user state) ────────────────────────
    await upsertArticles([{
      id: 'probe:1', source: 'hn', title: 'Probe article', url: 'https://probe.test/1',
      score: 10, comment_count: 2, subreddit: null, author: 'nobody',
      fetched_at: '2026-08-18T00:00:00.000Z', topics: ['AI', 'LLMs'],
    }] as never)
    const feedA = await getArticles(A, 'all', 50)
    add('article visible in feed', feedA.some(a => a.id === 'probe:1'), `${feedA.length} rows`)
    add('topics come back from the side table (no json_each)',
        feedA.find(a => a.id === 'probe:1')?.topics.sort().join(',') === 'AI,LLMs',
        JSON.stringify(feedA.find(a => a.id === 'probe:1')?.topics))

    const byTopic = await getArticlesByTopics(A, ['LLMs'], 'all', 50)
    add('topic filter finds it via article_topics', byTopic.some(a => a.id === 'probe:1'))
    add('topic filter excludes non-matching topics',
        (await getArticlesByTopics(A, ['Data Science'], 'all', 50)).length === 0)

    await cacheSummary('probe:1', 'a cached summary')
    add('summary cache is global', (await getSummary('probe:1')) === 'a cached summary')

    // Bookmarks are per-user; the article row itself is shared.
    await setBookmark(A, 'probe:1', true)
    add('A bookmark recorded', (await getBookmarkedArticles(A)).some(a => a.id === 'probe:1'))
    add('B has no bookmarks despite sharing the article', (await getBookmarkedArticles(B)).length === 0)
    add('bookmarked article leaves A feed', !(await getArticles(A, 'all', 50)).some(a => a.id === 'probe:1'))
    add('B still sees it in the feed (content is shared)',
        (await getArticles(B, 'all', 50)).some(a => a.id === 'probe:1'))

    // A refresh must not delete an article another tenant bookmarked.
    await clearNonBookmarkedArticles()
    add('bookmarked article survives clearNonBookmarked', (await getSummary('probe:1')) === 'a cached summary')
    await deleteBookmark(A, 'probe:1')
    add('unbookmark returns it to A feed', (await getArticles(A, 'all', 50)).some(a => a.id === 'probe:1'))

    // ── finance (LIKE + aggregates: the silent-failure zone) ──────────────
    const tx1 = await createTransaction(A, {
      date: '2026-08-10', description: 'A groceries', amount: 250.5,
      type: 'debit', category: 'Food & Dining', source: 'manual',
    })
    await createTransaction(A, {
      date: '2026-08-12', description: 'A salary', amount: 1000,
      type: 'credit', category: 'Transfers', source: 'manual',
    })
    await createTransaction(B, {
      date: '2026-08-11', description: 'B rent', amount: 9999,
      type: 'debit', category: 'Utilities', source: 'manual',
    })

    // These assert NON-ZERO totals on purpose: a % wildcard regression or a
    // scoping slip both produce 0, which would otherwise look like "no spending".
    const sum = await getTransactionSummary(A, '2026-08')
    add('summary debit is A-only and NON-ZERO', sum.debit === 250.5, `debit=${sum.debit}`)
    add('summary credit is A-only and NON-ZERO', sum.credit === 1000, `credit=${sum.credit}`)
    add('summary excludes B 9999 debit', sum.debit !== 10249.5 && sum.debit !== 9999)
    add('by_category is A-only', sum.by_category.length === 1
        && sum.by_category[0].category === 'Food & Dining', JSON.stringify(sum.by_category))

    const monthly = await getMonthlyTotals(A, 12)
    add('monthly totals derive the month without substr',
        monthly.some(m => m.month === '2026-08' && m.debit === 250.5), JSON.stringify(monthly))

    add('month filter finds rows (proves likePrefix not %)',
        (await getTransactions(A, { month: '2026-08' })).length === 2)
    add('description search works (JS-side, no inlined user text)',
        (await getTransactions(A, { q: 'groceries' })).length === 1)
    add('import sources aggregate per tenant',
        (await getImportSources(A)).find(s => s.source === 'manual')?.count === 2)

    // Budgets: the read-then-write upsert on the synthetic uk column.
    const bud = await upsertBudget(A, 'Food & Dining', 500, '2026-08')
    const bud2 = await upsertBudget(A, 'Food & Dining', 750, '2026-08')
    add('upsertBudget updates rather than duplicating', (await getBudgets(A, '2026-08')).length === 1)
    add('upsertBudget returns the EXISTING id on conflict', bud2.id === bud.id, `${bud.id} vs ${bud2.id}`)
    add('upsertBudget applied the new amount', (await getBudgets(A, '2026-08'))[0].amount === 750)
    await upsertBudget(B, 'Food & Dining', 111, '2026-08')
    add('B budget does not collide with A on the same category+month',
        (await getBudgets(A, '2026-08'))[0].amount === 750
        && (await getBudgets(B, '2026-08'))[0].amount === 111)

    // Cross-tenant finance writes
    await deleteTransaction(A, (await getTransactions(B, {}))[0].id)
    add('A cannot delete B transaction', (await getTransactions(B, {})).length === 1)
    await deleteBudget(A, (await getBudgets(B, '2026-08'))[0].id)
    add('A cannot delete B budget', (await getBudgets(B, '2026-08')).length === 1)

    // finance + article cleanup
    add('CONTROL own transaction delete works',
        (await deleteTransaction(A, tx1.id), (await getTransactions(A, {})).length === 1))
    await deleteTransactionsBySource(A, 'manual'); await deleteTransactionsBySource(B, 'manual')
    await deleteBudget(A, (await getBudgets(A, '2026-08'))[0].id)
    await deleteBudget(B, (await getBudgets(B, '2026-08'))[0].id)
    await clearNonBookmarkedArticles()
    add('finance/article cleanup complete',
      (await getTransactions(A, {})).length === 0 && (await getTransactions(B, {})).length === 0
      && (await getBudgets(A, '2026-08')).length === 0 && (await getArticles(A, 'all', 50)).length === 0)

    // cleanup
    await deleteNote(A, a2.id)
    await deleteNote(B, b1.id)
    add('cleanup leaves no verify rows',
      (await getNotes(A)).length === 0 && (await getNotes(B)).length === 0)
  } catch (e) {
    return NextResponse.json({
      env,
      fatal: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      checksCompleted: checks,
    }, { status: 500 })
  }

  const failed = checks.filter(c => !c.pass)
  return NextResponse.json({
    env,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  }, { status: failed.length ? 500 : 200 })
}
