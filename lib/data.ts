// The data-layer facade: routes import from here, not from lib/db directly.
//
// Every domain can be switched between Turso and Catalyst Cloud Scale
// independently, so the migration rolls out one domain at a time and any domain
// can be reverted by removing it from an env var — no code change, no redeploy of
// application logic.
//
//   CATALYST_DOMAINS=notes,todos,urai,vault,articles,finance,users
//
// Unset means everything stays on Turso. `all` switches every domain.
//
// WHY THE `pick` HELPER IS TYPED THE WAY IT IS: both implementations are passed to
// a function whose parameter types are inferred from the Turso side, so if a
// Catalyst adapter's signature ever drifts from its Turso counterpart, this file
// fails to compile. That makes signature parity a build-time guarantee rather than
// something to remember — which matters because the two implementations are
// otherwise entirely separate files.
import * as turso from './db'
import * as catNotes from './notes-catalyst'
import * as catTodos from './todos-catalyst'
import * as catUrai from './urai-catalyst'
import * as catVault from './vault-catalyst'
import * as catArticles from './articles-catalyst'
import * as catFinance from './finance-catalyst'
import * as catUsers from './users-catalyst'

export type Domain = 'notes' | 'todos' | 'urai' | 'vault' | 'articles' | 'finance' | 'users'

const raw = (process.env.CATALYST_DOMAINS ?? '').toLowerCase().trim()
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
 * Picks an implementation. `t` (Turso) fixes the expected type, so `c` must be
 * assignable to it — that is the signature-parity check.
 */
function pick<T>(domain: Domain, t: T, c: T): T {
  return usesCatalyst(domain) ? c : t
}

// ── notes ───────────────────────────────────────────────────────────────────
export const getNotes    = pick('notes', turso.getNotes,    catNotes.getNotes)
export const getNote     = pick('notes', turso.getNote,     catNotes.getNote)
export const createNote  = pick('notes', turso.createNote,  catNotes.createNote)
export const updateNote  = pick('notes', turso.updateNote,  catNotes.updateNote)
export const deleteNote  = pick('notes', turso.deleteNote,  catNotes.deleteNote)

// ── todos + reminders ───────────────────────────────────────────────────────
export const getTodos             = pick('todos', turso.getTodos,             catTodos.getTodos)
export const getTodosByDate       = pick('todos', turso.getTodosByDate,       catTodos.getTodosByDate)
export const getAgendaTodos       = pick('todos', turso.getAgendaTodos,       catTodos.getAgendaTodos)
export const getDatesWithTodos    = pick('todos', turso.getDatesWithTodos,    catTodos.getDatesWithTodos)
export const createTodo           = pick('todos', turso.createTodo,           catTodos.createTodo)
export const updateTodo           = pick('todos', turso.updateTodo,           catTodos.updateTodo)
export const deleteTodo           = pick('todos', turso.deleteTodo,           catTodos.deleteTodo)
export const getNyabagamByDate    = pick('todos', turso.getNyabagamByDate,    catTodos.getNyabagamByDate)
export const getUpcomingNyabagam  = pick('todos', turso.getUpcomingNyabagam,  catTodos.getUpcomingNyabagam)
export const getDatesWithNyabagam = pick('todos', turso.getDatesWithNyabagam, catTodos.getDatesWithNyabagam)
export const createNyabagam       = pick('todos', turso.createNyabagam,       catTodos.createNyabagam)
export const deleteNyabagam       = pick('todos', turso.deleteNyabagam,       catTodos.deleteNyabagam)

// ── urai ────────────────────────────────────────────────────────────────────
export const listConversations   = pick('urai', turso.listConversations,   catUrai.listConversations)
export const getConversation     = pick('urai', turso.getConversation,     catUrai.getConversation)
export const createConversation  = pick('urai', turso.createConversation,  catUrai.createConversation)
export const renameConversation  = pick('urai', turso.renameConversation,  catUrai.renameConversation)
export const touchConversation   = pick('urai', turso.touchConversation,   catUrai.touchConversation)
export const deleteConversation  = pick('urai', turso.deleteConversation,  catUrai.deleteConversation)
export const getMessages         = pick('urai', turso.getMessages,         catUrai.getMessages)
export const addMessage          = pick('urai', turso.addMessage,          catUrai.addMessage)

// ── vault ───────────────────────────────────────────────────────────────────
export const getVaultMeta          = pick('vault', turso.getVaultMeta,          catVault.getVaultMeta)
export const setVaultMeta          = pick('vault', turso.setVaultMeta,          catVault.setVaultMeta)
export const getVaultItems         = pick('vault', turso.getVaultItems,         catVault.getVaultItems)
export const createVaultItem       = pick('vault', turso.createVaultItem,       catVault.createVaultItem)
export const updateVaultItem       = pick('vault', turso.updateVaultItem,       catVault.updateVaultItem)
export const softDeleteVaultItem   = pick('vault', turso.softDeleteVaultItem,   catVault.softDeleteVaultItem)
export const restoreVaultItem      = pick('vault', turso.restoreVaultItem,      catVault.restoreVaultItem)
export const hardDeleteVaultItem   = pick('vault', turso.hardDeleteVaultItem,   catVault.hardDeleteVaultItem)
export const getVaultFolders       = pick('vault', turso.getVaultFolders,       catVault.getVaultFolders)
export const createVaultFolder     = pick('vault', turso.createVaultFolder,     catVault.createVaultFolder)
export const updateVaultFolder     = pick('vault', turso.updateVaultFolder,     catVault.updateVaultFolder)
export const softDeleteVaultFolder = pick('vault', turso.softDeleteVaultFolder, catVault.softDeleteVaultFolder)

// ── articles ────────────────────────────────────────────────────────────────
export const upsertArticles             = pick('articles', turso.upsertArticles,             catArticles.upsertArticles)
export const getArticles                = pick('articles', turso.getArticles,                catArticles.getArticles)
export const getArticlesByTopics        = pick('articles', turso.getArticlesByTopics,        catArticles.getArticlesByTopics)
export const getBookmarkedArticles      = pick('articles', turso.getBookmarkedArticles,      catArticles.getBookmarkedArticles)
export const setBookmark                = pick('articles', turso.setBookmark,                catArticles.setBookmark)
export const deleteBookmark             = pick('articles', turso.deleteBookmark,             catArticles.deleteBookmark)
export const getSummary                 = pick('articles', turso.getSummary,                 catArticles.getSummary)
export const cacheSummary               = pick('articles', turso.cacheSummary,               catArticles.cacheSummary)
export const setArticleEmbedding        = pick('articles', turso.setArticleEmbedding,        catArticles.setArticleEmbedding)
export const getArticlesForSearch       = pick('articles', turso.getArticlesForSearch,       catArticles.getArticlesForSearch)
export const clearNonBookmarkedArticles = pick('articles', turso.clearNonBookmarkedArticles, catArticles.clearNonBookmarkedArticles)

// ── finance ─────────────────────────────────────────────────────────────────
export const getTransactions           = pick('finance', turso.getTransactions,           catFinance.getTransactions)
export const getTransactionSummary     = pick('finance', turso.getTransactionSummary,     catFinance.getTransactionSummary)
export const createTransaction         = pick('finance', turso.createTransaction,         catFinance.createTransaction)
export const importTransactions        = pick('finance', turso.importTransactions,        catFinance.importTransactions)
export const deleteTransaction         = pick('finance', turso.deleteTransaction,         catFinance.deleteTransaction)
export const getImportSources          = pick('finance', turso.getImportSources,          catFinance.getImportSources)
export const deleteTransactionsBySource = pick('finance', turso.deleteTransactionsBySource, catFinance.deleteTransactionsBySource)
export const getMonthlyTotals          = pick('finance', turso.getMonthlyTotals,          catFinance.getMonthlyTotals)
export const getBudgets                = pick('finance', turso.getBudgets,                catFinance.getBudgets)
export const upsertBudget              = pick('finance', turso.upsertBudget,              catFinance.upsertBudget)
export const deleteBudget              = pick('finance', turso.deleteBudget,              catFinance.deleteBudget)

// ── users + push + cron ─────────────────────────────────────────────────────
export const getUserById                 = pick('users', turso.getUserById,                 catUsers.getUserById)
export const findUserByEmail             = pick('users', turso.findUserByEmail,             catUsers.findUserByEmail)
export const findUserByFirebaseUid       = pick('users', turso.findUserByFirebaseUid,       catUsers.findUserByFirebaseUid)
export const createUser                  = pick('users', turso.createUser,                  catUsers.createUser)
export const linkFirebaseUid             = pick('users', turso.linkFirebaseUid,             catUsers.linkFirebaseUid)
export const touchUserLogin              = pick('users', turso.touchUserLogin,              catUsers.touchUserLogin)
export const savePushSubscription        = pick('users', turso.savePushSubscription,        catUsers.savePushSubscription)
export const getPushSubscriptionsForUser = pick('users', turso.getPushSubscriptionsForUser, catUsers.getPushSubscriptionsForUser)
export const deletePushSubscription      = pick('users', turso.deletePushSubscription,      catUsers.deletePushSubscription)
export const markNyabagamNotified        = pick('users', turso.markNyabagamNotified,        catUsers.markNyabagamNotified)
// Unscoped cron sweep: must see every tenant's due reminders in one pass. Follows
// the `users` flag because it lives alongside push delivery.
export const getDueNyabagam              = pick('users', turso.getDueNyabagam,              catUsers.getDueNyabagam)
export const getDueNyabagamForUser       = pick('users', turso.getDueNyabagamForUser,       catUsers.getDueNyabagamForUser)

// Not switchable: pure functions and helpers with no datastore involvement.
export const autoCategory = turso.autoCategory
export const FINANCE_CATEGORIES = turso.FINANCE_CATEGORIES
