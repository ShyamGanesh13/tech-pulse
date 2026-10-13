/**
 * The category list, shared by the server-side categoriser and the client UI.
 *
 * Its own leaf module with no imports on purpose: the UI needs this list, and
 * importing it from lib/categorise.ts would drag the LLM client — and the
 * credentials it reads — into the browser bundle.
 */
export const CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Home Rent',
  'Finance',
  'Education',
  'Transfers',
  'Income',
  'Other',
]
