// The proof that tenancy actually holds. Two guards matter here and they catch
// different bugs:
//
//  - The READ tests catch a missing `WHERE user_id = ?` on a list query.
//  - The WRITE tests catch a missing `AND user_id = ?` on an UPDATE/DELETE.
//
// The write half is not optional. TypeScript is perfectly happy with
// `updateNote(userId, id, patch)` whose SQL says only `WHERE id = ?`, and a
// read-only test suite would never notice.
import { describe, it, expect, beforeAll } from 'bun:test'
import {
  client, createUser, getUserById,
  createNote, getNotes, getNote, updateNote, deleteNote,
  createTodo, getTodos, updateTodo, deleteTodo,
  createNyabagam, getUpcomingNyabagam, deleteNyabagam,
  upsertBudget, getBudgets, deleteBudget,
  createTransaction, getTransactions, getTransactionSummary, getMonthlyTotals, deleteTransaction,
  createConversation, listConversations, getConversation, getMessages, addMessage, deleteConversation,
  setVaultMeta, getVaultMeta, createVaultItem, getVaultItems, updateVaultItem, hardDeleteVaultItem,
  setBookmark, getBookmarkedArticles, upsertArticles, getArticles,
  clearNonBookmarkedArticles, getFeedPrefs, setFeedPrefs,
} from '@/lib/db'

// `articles` joined this list when the feed became per-tenant. It used to be
// global content shared by every reader, and was cleaned up separately below.
const SCOPED_TABLES = [
  'articles', 'user_articles', 'todos', 'nyabagam', 'notes',
  'finance_transactions', 'finance_budgets', 'push_subscriptions',
  'urai_conversations', 'urai_messages',
  'vault_meta', 'vault_items', 'vault_folders',
]

let A = ''
let B = ''
const bRow: Record<string, string | number> = {}

beforeAll(async () => {
  // A real db function call is what triggers ensureInit(); the raw `client`
  // export bypasses it, so `client.execute` alone would hit missing tables.
  await getUserById('trigger-schema-init')
  for (const t of [...SCOPED_TABLES, 'user_feed_prefs', 'users']) {
    await client.execute(`DELETE FROM ${t}`)
  }

  A = (await createUser({ email: 'a@tenant.test', firebase_uid: 'fb-a', name: 'A', picture: null })).id
  B = (await createUser({ email: 'b@tenant.test', firebase_uid: 'fb-b', name: 'B', picture: null })).id

  // Seed tenant B with one row in every domain.
  bRow.note = (await createNote(B, 'B note', 'B secret body')).id
  bRow.todo = (await createTodo(B, 'B todo', null, 'medium')).id
  bRow.nyabagam = (await createNyabagam(B, 'B reminder', null, '2099-06-01T09:00:00.000Z')).id
  bRow.budget = (await upsertBudget(B, 'Food & Dining', 500, '2026-08')).id
  bRow.txn = (await createTransaction(B, {
    date: '2026-08-10', description: 'B groceries', amount: 250,
    type: 'debit', category: 'Food & Dining', source: 'manual',
  })).id

  const conv = await createConversation(B, 'B chat')
  bRow.conv = conv.id
  await addMessage(B, conv.id, 'user', 'B secret message')

  await setVaultMeta(B, { kdf_salt: 'b-salt', kdf_iterations: 600000, wrapped_dek: 'b-dek' })
  bRow.vaultItem = (await createVaultItem(B, {
    id: crypto.randomUUID(), iv: 'b-iv', ciphertext: 'B-ciphertext',
  })).id

  // Articles are PER-TENANT now: B's refresh writes B's rows. A must not see
  // them even though the article id is a public, guessable one.
  await upsertArticles(B, [
    {
      id: 'hn:iso1', source: 'hn', title: 'B bookmarked row',
      url: 'https://example.com/1', score: 10, comment_count: 0,
      subreddit: null, author: null, fetched_at: '2026-08-10T00:00:00.000Z', topics: ['AI'],
    },
    // Unbookmarked, because getArticles deliberately excludes the caller's own
    // bookmarks — without this row B's feed would read as empty and the
    // isolation assertion below could not tell "scoped correctly" from "broken".
    {
      id: 'hn:iso2', source: 'hn', title: 'B feed row',
      url: 'https://example.com/2', score: 5, comment_count: 0,
      subreddit: null, author: null, fetched_at: '2026-08-10T00:00:00.000Z', topics: ['AI'],
    },
  ])
  await setBookmark(B, 'hn:iso1', true)
})

describe('tenancy: A cannot READ B data', () => {
  it('notes', async () => {
    expect(await getNotes(A)).toEqual([])
    expect(await getNote(A, bRow.note as number)).toBeNull()
  })
  it('todos', async () => {
    expect(await getTodos(A)).toEqual([])
  })
  it('reminders', async () => {
    expect(await getUpcomingNyabagam(A, '2099-01-01', 3650)).toEqual([])
  })
  it('budgets', async () => {
    expect(await getBudgets(A, '2026-08')).toEqual([])
  })
  it('transactions and aggregates', async () => {
    expect(await getTransactions(A, {})).toEqual([])
    // An unscoped SUM would blend both tenants into one plausible number
    // rather than failing loudly — the worst kind of leak.
    const summary = await getTransactionSummary(A, '2026-08')
    expect(summary.debit).toBe(0)
    expect(summary.count).toBe(0)
    expect(await getMonthlyTotals(A, 12)).toEqual([])
  })
  it('conversations and messages', async () => {
    expect(await listConversations(A)).toEqual([])
    expect(await getConversation(A, bRow.conv as number)).toBeNull()
    expect(await getMessages(A, bRow.conv as number)).toEqual([])
  })
  it('vault key material is per-user', async () => {
    expect(await getVaultMeta(A)).toBeNull()
  })
  it('vault items', async () => {
    expect(await getVaultItems(A)).toEqual([])
  })
  it('bookmarks', async () => {
    expect(await getBookmarkedArticles(A)).toEqual([])
    expect((await getBookmarkedArticles(B)).length).toBe(1)
  })
  // The feed itself is per-tenant now, so a public and entirely guessable
  // article id must not be enough to read another tenant's row.
  it('article rows', async () => {
    expect(await getArticles(A, 'all', 100)).toEqual([])
    // Only the unbookmarked row; hn:iso1 is excluded from B's own feed.
    expect((await getArticles(B, 'all', 100)).map(a => a.id)).toEqual(['hn:iso2'])
  })
  it('feed preferences fall back to defaults rather than leaking B\'s', async () => {
    await setFeedPrefs(B, { sources: ['arxiv'], topics: ['Transformers'] })
    const aPrefs = await getFeedPrefs(A)
    expect(aPrefs.sources.length).toBeGreaterThan(1)
    expect(aPrefs.topics).toContain('AI')
    expect((await getFeedPrefs(B)).sources).toEqual(['arxiv'])
  })
})

describe('tenancy: one tenant\'s refresh cannot destroy another\'s feed', () => {
  // The whole reason articles became per-tenant. A preference-scoped refresh
  // against the old shared pool would have had A's narrow subscription delete
  // every row B had just fetched.
  it('clearNonBookmarkedArticles only deletes the caller\'s rows', async () => {
    await upsertArticles(A, [{
      id: 'hn:iso-a', source: 'hn', title: 'A row',
      url: 'https://example.com/a', score: 1, comment_count: 0,
      subreddit: null, author: null, fetched_at: '2026-08-10T00:00:00.000Z', topics: ['AI'],
    }])
    expect((await getArticles(A, 'all', 100)).length).toBe(1)

    await clearNonBookmarkedArticles(A)

    expect(await getArticles(A, 'all', 100)).toEqual([])
    // B's rows are untouched: the bookmarked one and the plain one both survive
    // a clear issued by a different tenant.
    expect((await getBookmarkedArticles(B)).length).toBe(1)
    expect((await getArticles(B, 'all', 100)).map(a => a.id)).toEqual(['hn:iso2'])
  })

  it('two tenants hold independent rows for the same article id', async () => {
    const row = {
      id: 'hn:same', source: 'hn' as const, url: 'https://example.com/same',
      score: 1, comment_count: 0, subreddit: null, author: null,
      fetched_at: '2026-08-10T00:00:00.000Z', topics: ['AI'],
    }
    await upsertArticles(A, [{ ...row, title: 'A copy' }])
    await upsertArticles(B, [{ ...row, title: 'B copy' }])

    expect((await getArticles(A, 'all', 100)).find(a => a.id === 'hn:same')?.title).toBe('A copy')
    expect((await getArticles(B, 'all', 100)).find(a => a.id === 'hn:same')?.title).toBe('B copy')

    await clearNonBookmarkedArticles(A)
    expect((await getArticles(B, 'all', 100)).find(a => a.id === 'hn:same')?.title).toBe('B copy')
  })
})

describe('tenancy: A cannot WRITE B data', () => {
  it('cannot update B note', async () => {
    await updateNote(A, bRow.note as number, { title: 'HACKED', content: 'HACKED' })
    const still = await getNote(B, bRow.note as number)
    expect(still?.title).toBe('B note')
    expect(still?.content).toBe('B secret body')
  })
  it('cannot delete B note', async () => {
    await deleteNote(A, bRow.note as number)
    expect(await getNote(B, bRow.note as number)).not.toBeNull()
  })
  it('cannot update B todo', async () => {
    await updateTodo(A, bRow.todo as number, { title: 'HACKED', done: 1 })
    const mine = await getTodos(B)
    expect(mine[0].title).toBe('B todo')
    expect(mine[0].done).toBe(0)
  })
  it('cannot delete B todo', async () => {
    await deleteTodo(A, bRow.todo as number)
    expect((await getTodos(B)).length).toBe(1)
  })
  it('cannot delete B reminder', async () => {
    await deleteNyabagam(A, bRow.nyabagam as number)
    expect((await getUpcomingNyabagam(B, '2099-01-01', 3650)).length).toBe(1)
  })
  it('cannot delete B budget', async () => {
    await deleteBudget(A, bRow.budget as number)
    expect((await getBudgets(B, '2026-08')).length).toBe(1)
  })
  it('cannot delete B transaction', async () => {
    await deleteTransaction(A, bRow.txn as number)
    expect((await getTransactions(B, {})).length).toBe(1)
  })
  it('cannot delete B conversation or its messages', async () => {
    await deleteConversation(A, bRow.conv as number)
    expect(await getConversation(B, bRow.conv as number)).not.toBeNull()
    expect((await getMessages(B, bRow.conv as number)).length).toBe(1)
  })
  it('cannot overwrite B vault item ciphertext', async () => {
    await updateVaultItem(A, bRow.vaultItem as string, 'a-iv', 'HACKED-ciphertext')
    const items = await getVaultItems(B)
    expect(items[0].ciphertext).toBe('B-ciphertext')
  })
  it('cannot hard-delete B vault item', async () => {
    await hardDeleteVaultItem(A, bRow.vaultItem as string)
    expect((await getVaultItems(B)).length).toBe(1)
  })
  it('cannot clobber B vault key material', async () => {
    await setVaultMeta(A, { kdf_salt: 'a-salt', kdf_iterations: 600000, wrapped_dek: 'a-dek' })
    expect((await getVaultMeta(B))?.wrapped_dek).toBe('b-dek')
    expect((await getVaultMeta(A))?.wrapped_dek).toBe('a-dek')
  })
  it('budgets do not collide across tenants on the same category+month', async () => {
    // UNIQUE(user_id, category, month): without user_id in the constraint, A
    // writing the same category would overwrite B's budget.
    await upsertBudget(A, 'Food & Dining', 999, '2026-08')
    expect((await getBudgets(B, '2026-08'))[0].amount).toBe(500)
    expect((await getBudgets(A, '2026-08'))[0].amount).toBe(999)
  })
})

describe('tenancy: scoped functions fail closed', () => {
  it('throw rather than querying when userId is empty', async () => {
    await expect(getNotes('')).rejects.toThrow(/userId is required/)
    await expect(getVaultItems('')).rejects.toThrow(/userId is required/)
    await expect(getTransactions('', {})).rejects.toThrow(/userId is required/)
  })
})
