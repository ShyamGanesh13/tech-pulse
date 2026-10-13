'use client'

// Primitives shared by Selvam's screens: the category list and its colours, the
// rupee formatter, the standard input style, and the empty-state line.
//
// Their own module rather than exports from page.tsx, so a component can use
// them without importing the page that renders it — that was a cycle.
export const CATEGORIES = ['Food & Dining', 'Transport', 'Shopping', 'Utilities', 'Entertainment', 'Healthcare', 'Home Rent', 'Finance', 'Education', 'Transfers', 'Other']

export const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#f97316', 'Transport': '#3b82f6', 'Shopping': '#ec4899',
  'Utilities': '#06b6d4', 'Entertainment': '#8b5cf6', 'Healthcare': '#10b981',
  'Home Rent': '#f59e0b', 'Finance': '#6366f1', 'Education': '#a78bfa',
  'Transfers': '#6b7280', 'Other': '#9ca3af',
}

export const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export const iStyle: React.CSSProperties = { width: '100%', height: '34px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }

export function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, padding: '32px 0', textAlign: 'center' }}>{text}</p>
}
