'use client'

// Primitives shared by Selvam's screens: the category list and its colours, the
// rupee formatter, the standard input style, and the empty-state line.
//
// Their own module rather than exports from page.tsx, so a component can use
// them without importing the page that renders it — that was a cycle.
import { useEffect, useRef, useState } from 'react'

export { CATEGORIES } from '@/lib/categories'

export const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#f97316', 'Transport': '#3b82f6', 'Shopping': '#ec4899',
  'Utilities': '#06b6d4', 'Entertainment': '#8b5cf6', 'Healthcare': '#10b981',
  'Home Rent': '#f59e0b', 'Finance': '#6366f1', 'Education': '#a78bfa',
  'Transfers': '#6b7280', 'Income': '#22c55e', 'Other': '#9ca3af',
}

export const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

// ── Thunai look, tuned for Selvam ───────────────────────────────────────────
// Signature emerald hue for actions/headers; income green / expense red / the
// category and brand colours stay as literal data (they encode meaning).
export const SELVAM = 'var(--app-selvam)'

/** Standard elevated card — 1px border + big radius + soft shadow. */
export const card: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--sh-2)', padding: '18px',
}

/** Tinted AI surface — faint var(--ai) wash over the panel. */
export const aiCard: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--ai) 8%, var(--panel))',
  border: '1px solid color-mix(in srgb, var(--ai) 28%, var(--border))',
  borderRadius: 'var(--radius)', boxShadow: 'var(--sh-2)', padding: '18px',
}

/** Emerald primary button. Pass disabled to dim it. */
export const btn = (disabled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  height: '34px', padding: '0 16px', borderRadius: 'var(--radius-sm)', border: 'none',
  background: disabled ? 'color-mix(in srgb, var(--app-selvam) 35%, transparent)' : 'var(--app-selvam)',
  color: '#fff', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
  transition: 'filter .2s', whiteSpace: 'nowrap',
})

export const iStyle: React.CSSProperties = { width: '100%', height: '34px', padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }

/** Count a number up to its target once, respecting reduced-motion. */
export function useCountUp(target: number, ms = 650): number {
  const [v, setV] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = prev.current
    prev.current = target
    if (reduce || from === target) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(from + (target - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, padding: '32px 0', textAlign: 'center' }}>{text}</p>
}
