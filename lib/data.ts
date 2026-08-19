// The data-layer facade: routes import from here, not from lib/db directly.
//
// Every domain can be switched between Turso and Catalyst Cloud Scale
// independently, so the migration rolls out one domain at a time and any domain
// can be reverted by removing it from an env var — no code change, no redeploy of
// application logic.
//
//   TP_CATALYST_DOMAINS=notes,todos,urai,vault,articles,finance,users
//
// NOT named CATALYST_DOMAINS: AppSail rejects any env var starting with CATALYST_
// as a reserved keyword (400 "environment_variables must not contain reserved
// keywords"), so a flag with that prefix could never be set in production.
//
// Unset means everything stays on Turso. `all` switches every domain.
//
// WHY THE `pick` HELPER IS TYPED THE WAY IT IS: both implementations are passed to
// a function whose parameter types are inferred from the Turso side, so if a
// Catalyst adapter's signature ever drifts from its Turso counterpart, this file
// fails to compile. That makes signature parity a build-time guarantee rather than
// something to remember — which matters because the two implementations are
// otherwise entirely separate files.
// TYPE-only: erased at compile time, so importing this facade does NOT pull in
// the Turso driver. That matters because @libsql/client ships a NATIVE binary and
// the deploy bundle is built on macOS — build/node_modules/@libsql/darwin-arm64/
// index.node cannot load on AppSail's Linux runtime and throws at import,
// 500-ing every route that touches it. With every domain on Catalyst the driver
// is never required at all.
type TursoMod = typeof import('./db')
let _turso: TursoMod | null = null
function turso(): TursoMod {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (_turso ??= require('./db') as TursoMod)
}
import * as catNotes from './notes-catalyst'
import * as catTodos from './todos-catalyst'
import * as catUrai from './urai-catalyst'
import * as catVault from './vault-catalyst'
import * as catArticles from './articles-catalyst'
import * as catFinance from './finance-catalyst'
import * as catUsers from './users-catalyst'

export type Domain = 'notes' | 'todos' | 'urai' | 'vault' | 'articles' | 'finance' | 'users'

const raw = (process.env.TP_CATALYST_DOMAINS ?? '').toLowerCase().trim()
const enabledSet = new Set(
  raw === 'all'
    ? ['notes', 'todos', 'urai', 'vault', 'articles', 'finance', 'users']
    : raw.split(',').map(s => s.trim()).filter(Boolean),
)

export function usesCatalyst(domain: Domain): boolean {
  return enabledSet.has(domain)
}

/** Reports which backend serves each domain — used by the diagnostics route. */
export function backendMap(): Record<Domain, 'catalyst' | 'turso'> {
  const domains: Domain[] = ['notes', 'todos', 'urai', 'vault', 'articles', 'finance', 'users']
  return Object.fromEntries(
    domains.map(d => [d, usesCatalyst(d) ? 'catalyst' : 'turso']),
  ) as Record<Domain, 'catalyst' | 'turso'>
}

/**
 * Dispatches to Catalyst or Turso at CALL time, loading the Turso module only if
 * a domain actually needs it.
 *
 * Typing `c` as TursoMod[K] keeps signature parity a compile error: a Catalyst
 * adapter whose signature drifts from its Turso counterpart fails the build. That
 * is the only structural link between two otherwise independent implementations.
 */
function pick<K extends keyof TursoMod>(domain: Domain, key: K, c: TursoMod[K]): TursoMod[K] {
  return ((...args: unknown[]) => {
    const impl = usesCatalyst(domain) ? c : turso()[key]
    return (impl as (...a: unknown[]) => unknown)(...args)
  }) as TursoMod[K]
}

// ── notes ───────────────────────────────────────────────────────────────────
export const getNotes    = pick('notes', 'getNotes', catNotes.getNotes)
export const getNote     = pick('notes', 'getNote', catNotes.getNote)
export const createNote  = pick('notes', 'createNote', catNotes.createNote)
export const updateNote  = pick('notes', 'updateNote', catNotes.updateNote)
export const deleteNote  = pick('notes', 'deleteNote', catNotes.deleteNote)

// ── todos + reminders ───────────────────────────────────────────────────────
export const getTodos             = pick('todos', 'getTodos', catTodos.getTodos)
export const getTodosByDate       = pick('todos', 'getTodosByDate', catTodos.getTodosByDate)
export const getAgendaTodos       = pick('todos', 'getAgendaTodos', catTodos.getAgendaTodos)
export const getDatesWithTodos    = pick('todos', 'getDatesWithTodos', catTodos.getDatesWithTodos)
export const createTodo           = pick('todos', 'createTodo', catTodos.createTodo)
export const updateTodo           = pick('todos', 'updateTodo', catTodos.updateTodo)
export const deleteTodo           = pick('todos', 'deleteTodo', catTodos.deleteTodo)
export const getNyabagamByDate    = pick('todos', 'getNyabagamByDate', catTodos.getNyabagamByDate)
export const getUpcomingNyabagam  = pick('todos', 'getUpcomingNyabagam', catTodos.getUpcomingNyabagam)
export const getDatesWithNyabagam = pick('todos', 'getDatesWithNyabagam', catTodos.getDatesWithNyabagam)
export const createNyabagam       = pick('todos', 'createNyabagam', catTodos.createNyabagam)
export const deleteNyabagam       = pick('todos', 'deleteNyabagam', catTodos.deleteNyabagam)

// ── urai ────────────────────────────────────────────────────────────────────
export const listConversations   = pick('urai', 'listConversations', catUrai.listConversations)
export const getConversation     = pick('urai', 'getConversation', catUrai.getConversation)
export const createConversation  = pick('urai', 'createConversation', catUrai.createConversation)
export const renameConversation  = pick('urai', 'renameConversation', catUrai.renameConversation)
export const touchConversation   = pick('urai', 'touchConversation', catUrai.touchConversation)
export const deleteConversation  = pick('urai', 'deleteConversation', catUrai.deleteConversation)
export const getMessages         = pick('urai', 'getMessages', catUrai.getMessages)
export const addMessage          = pick('urai', 'addMessage', catUrai.addMessage)

// ── vault ───────────────────────────────────────────────────────────────────
export const getVaultMeta          = pick('vault', 'getVaultMeta', catVault.getVaultMeta)
export const setVaultMeta          = pick('vault', 'setVaultMeta', catVault.setVaultMeta)
export const getVaultItems         = pick('vault', 'getVaultItems', catVault.getVaultItems)
export const createVaultItem       = pick('vault', 'createVaultItem', catVault.createVaultItem)
export const updateVaultItem       = pick('vault', 'updateVaultItem', catVault.updateVaultItem)
export const softDeleteVaultItem   = pick('vault', 'softDeleteVaultItem', catVault.softDeleteVaultItem)
export const restoreVaultItem      = pick('vault', 'restoreVaultItem', catVault.restoreVaultItem)
export const hardDeleteVaultItem   = pick('vault', 'hardDeleteVaultItem', catVault.hardDeleteVaultItem)
export const getVaultFolders       = pick('vault', 'getVaultFolders', catVault.getVaultFolders)
export const createVaultFolder     = pick('vault', 'createVaultFolder', catVault.createVaultFolder)
export const updateVaultFolder     = pick('vault', 'updateVaultFolder', catVault.updateVaultFolder)
export const softDeleteVaultFolder = pick('vault', 'softDeleteVaultFolder', catVault.softDeleteVaultFolder)

// ── articles ────────────────────────────────────────────────────────────────
export const upsertArticles             = pick('articles', 'upsertArticles', catArticles.upsertArticles)
export const getArticles                = pick('articles', 'getArticles', catArticles.getArticles)
export const getArticlesByTopics        = pick('articles', 'getArticlesByTopics', catArticles.getArticlesByTopics)
export const getBookmarkedArticles      = pick('articles', 'getBookmarkedArticles', catArticles.getBookmarkedArticles)
export const setBookmark                = pick('articles', 'setBookmark', catArticles.setBookmark)
export const deleteBookmark             = pick('articles', 'deleteBookmark', catArticles.deleteBookmark)
export const getSummary                 = pick('articles', 'getSummary', catArticles.getSummary)
export const cacheSummary               = pick('articles', 'cacheSummary', catArticles.cacheSummary)
export const setArticleEmbedding        = pick('articles', 'setArticleEmbedding', catArticles.setArticleEmbedding)
export const getArticlesForSearch       = pick('articles', 'getArticlesForSearch', catArticles.getArticlesForSearch)
export const clearNonBookmarkedArticles = pick('articles', 'clearNonBookmarkedArticles', catArticles.clearNonBookmarkedArticles)

// ── finance ─────────────────────────────────────────────────────────────────
export const getTransactions           = pick('finance', 'getTransactions', catFinance.getTransactions)
export const getTransactionSummary     = pick('finance', 'getTransactionSummary', catFinance.getTransactionSummary)
export const createTransaction         = pick('finance', 'createTransaction', catFinance.createTransaction)
export const importTransactions        = pick('finance', 'importTransactions', catFinance.importTransactions)
export const deleteTransaction         = pick('finance', 'deleteTransaction', catFinance.deleteTransaction)
export const getImportSources          = pick('finance', 'getImportSources', catFinance.getImportSources)
export const deleteTransactionsBySource = pick('finance', 'deleteTransactionsBySource', catFinance.deleteTransactionsBySource)
export const getMonthlyTotals          = pick('finance', 'getMonthlyTotals', catFinance.getMonthlyTotals)
export const getBudgets                = pick('finance', 'getBudgets', catFinance.getBudgets)
export const upsertBudget              = pick('finance', 'upsertBudget', catFinance.upsertBudget)
export const deleteBudget              = pick('finance', 'deleteBudget', catFinance.deleteBudget)

// ── users + push + cron ─────────────────────────────────────────────────────
export const getUserById                 = pick('users', 'getUserById', catUsers.getUserById)
export const findUserByEmail             = pick('users', 'findUserByEmail', catUsers.findUserByEmail)
export const findUserByFirebaseUid       = pick('users', 'findUserByFirebaseUid', catUsers.findUserByFirebaseUid)
export const createUser                  = pick('users', 'createUser', catUsers.createUser)
export const linkFirebaseUid             = pick('users', 'linkFirebaseUid', catUsers.linkFirebaseUid)
export const touchUserLogin              = pick('users', 'touchUserLogin', catUsers.touchUserLogin)
export const savePushSubscription        = pick('users', 'savePushSubscription', catUsers.savePushSubscription)
export const getPushSubscriptionsForUser = pick('users', 'getPushSubscriptionsForUser', catUsers.getPushSubscriptionsForUser)
export const deletePushSubscription      = pick('users', 'deletePushSubscription', catUsers.deletePushSubscription)
export const markNyabagamNotified        = pick('users', 'markNyabagamNotified', catUsers.markNyabagamNotified)
// Unscoped cron sweep: must see every tenant's due reminders in one pass. Follows
// the `users` flag because it lives alongside push delivery.
export const getDueNyabagam              = pick('users', 'getDueNyabagam', catUsers.getDueNyabagam)
export const getDueNyabagamForUser       = pick('users', 'getDueNyabagamForUser', catUsers.getDueNyabagamForUser)

// Not switchable: pure functions and helpers with no datastore involvement.
// Pure function with no datastore involvement, but it lives in lib/db, so it is
// wrapped lazily too rather than forcing the driver to load.
export const autoCategory: TursoMod['autoCategory'] = (...a) => turso().autoCategory(...a)
// A plain constant list — inlined here so nothing has to load lib/db for it.
export const FINANCE_CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Utilities',
  'Entertainment', 'Healthcare', 'Finance', 'Education', 'Transfers', 'Other',
] as const
