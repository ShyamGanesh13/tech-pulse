'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Receipt, Upload, Plus, Trash2, Search, FileText } from 'lucide-react'
import { AnalysisCards, SpendingPlan } from './AnalysisCards'
import { CATEGORIES, CAT_COLORS, Empty, fmt, iStyle, card, aiCard, btn, SELVAM, useCountUp } from './ui'
import { keywordCategory } from '@/lib/category-keywords'
import { renderMarkdown } from '@/app/components/Markdown'

type Tab = 'Overview' | 'Transactions' | 'Analytics' | 'Budgets' | 'Import'
const TABS: Tab[] = ['Overview', 'Transactions', 'Analytics', 'Budgets', 'Import']

const CAT_EMOJI: Record<string, string> = {
  'Food & Dining': '🍽', 'Transport': '🚗', 'Shopping': '🛍', 'Utilities': '💡',
  'Entertainment': '🎬', 'Healthcare': '💊', 'Home Rent': '🏠',
  'Finance': '🏦', 'Education': '📚', 'Transfers': '💸', 'Other': '•',
}

const thisMonth = () => new Date().toISOString().slice(0, 7)
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) }
const monthFull  = (m: string) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }

function stepMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function MonthNav({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const atMax = value >= thisMonth()
  const navBtn = (disabled: boolean): React.CSSProperties => ({ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '999px', cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: '14px', lineHeight: 1, transition: 'background .2s, color .2s' })
  return (
    <div className="sv-monthnav" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px', boxShadow: 'var(--sh-1)' }}>
      <button onClick={() => onChange(stepMonth(value, -1))} style={navBtn(false)}>‹</button>
      <span className="font-display" style={{ padding: '0 8px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '104px', textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{monthFull(value)}</span>
      <button onClick={() => !atMax && onChange(stepMonth(value, 1))} style={navBtn(atMax)}>›</button>
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ month }: { month: string }) {
  const [data, setData] = useState<any>(null)
  const [monthly, setMonthly] = useState<any[]>([])
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState(false)

  useEffect(() => {
    fetch(`/api/selvam/transactions?month=${month}`).then(r => r.json()).then(setData)
    fetch('/api/selvam/monthly?months=4').then(r => r.json()).then(setMonthly)
    setInsight(null)
    setInsightError(false)
    setInsightLoading(true)
    fetch(`/api/selvam/insights?month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.insight) setInsight(d.insight)
        else setInsightError(true)
      })
      .catch(() => setInsightError(true))
      .finally(() => setInsightLoading(false))
  }, [month])

  const summary = data?.summary ?? {}
  const credit: number = summary.credit ?? 0
  const debit: number = summary.debit ?? 0
  const net = credit - debit
  const cuNet = useCountUp(net)
  const cuCredit = useCountUp(credit)
  const cuDebit = useCountUp(debit)

  if (!data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>

  const { transactions = [] } = data
  const { count = 0, by_category = [] } = summary

  // Donut chart data
  const totalSpend = by_category.reduce((s: number, c: any) => s + c.amount, 0)
  let cum = 0
  const segs = by_category.slice(0, 7).map((c: any) => {
    const pct = totalSpend > 0 ? (c.amount / totalSpend) * 100 : 0
    const s = { ...c, pct, start: cum }
    cum += pct
    return s
  })
  const donut = segs.map((s: any) => `${CAT_COLORS[s.category] || '#9ca3af'} ${s.start.toFixed(1)}% ${(s.start + s.pct).toFixed(1)}%`).join(', ')

  // Mini bar chart (last 4 months)
  const maxBar = Math.max(...monthly.flatMap((m: any) => [m.credit, m.debit]), 1)

  // Delta vs the previous month in the trend series (derived, no extra fetch).
  const mi = monthly.findIndex((m: any) => m.month === month)
  const prevNet = mi > 0 ? monthly[mi - 1].credit - monthly[mi - 1].debit : null
  const delta = prevNet != null ? net - prevNet : null

  return (
    <div className="tp-dock-pad" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Hero bento: net this month + income / expenses / count tiles */}
      <div className="sv-bento">
        <div className="sv-card sv-card-hover" style={{ ...card, position: 'relative', overflow: 'hidden', padding: '24px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span aria-hidden style={{ position: 'absolute', width: '220px', height: '220px', borderRadius: '50%', right: '-60px', top: '-80px', background: `radial-gradient(circle, ${SELVAM}, transparent 70%)`, opacity: 0.14, filter: 'blur(26px)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Net this month</span>
            {delta != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', color: delta >= 0 ? '#10b981' : '#ef4444', background: delta >= 0 ? '#10b98118' : '#ef444418' }}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))} vs last month
              </span>
            )}
          </div>
          <div className="font-display tnum" style={{ fontSize: 'clamp(2.4rem, 6.5vw, 3.6rem)', fontWeight: 800, color: net >= 0 ? '#10b981' : '#ef4444', letterSpacing: '-0.035em', lineHeight: 1.02 }}>{fmt(cuNet)}</div>
          <div style={{ display: 'flex', gap: '22px', marginTop: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <ArrowDownCircle size={15} color="#10b981" />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>In</span>
              <span className="tnum" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(cuCredit)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <ArrowUpCircle size={15} color="#ef4444" />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Out</span>
              <span className="tnum" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(cuDebit)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { label: 'Income', value: fmt(cuCredit), color: '#10b981', Icon: ArrowDownCircle },
            { label: 'Expenses', value: fmt(cuDebit), color: '#ef4444', Icon: ArrowUpCircle },
            { label: 'Transactions', value: String(count), color: 'var(--accent)', Icon: Receipt },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="sv-card sv-card-hover" style={{ ...card, flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                <Icon size={15} color={color} />
              </div>
              <div className="font-display tnum" style={{ fontSize: '21px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="sv-grid-2">
        {/* Spending donut */}
        <div className="sv-card sv-card-hover" style={card}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Spending Breakdown</h3>
          {segs.length === 0 ? <Empty text="No spending data" /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ position: 'relative', width: '118px', height: '118px', flexShrink: 0 }}>
                <div className="sv-donut" style={{ width: '118px', height: '118px', borderRadius: '50%', background: `conic-gradient(${donut})`, boxShadow: 'var(--sh-1)' }} />
                <div style={{ position: 'absolute', inset: '21px', borderRadius: '50%', background: 'var(--panel)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12)' }}>
                  <div className="font-display tnum" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(totalSpend)}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>spent</div>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {segs.map((s: any) => (
                  <div key={s.category} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[s.category] || '#9ca3af', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.category}</span>
                    <span className="tnum" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{s.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mini trend chart */}
        <div className="sv-card sv-card-hover" style={card}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Monthly Trend</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px', display: 'flex', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '7px', height: '7px', borderRadius: '2px', background: '#10b981', display: 'inline-block' }} /> In</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '7px', height: '7px', borderRadius: '2px', background: '#ef4444', display: 'inline-block' }} /> Out</span>
          </p>
          {monthly.length === 0 ? <Empty text="Import transactions to see trend" /> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '100px' }}>
              {monthly.map((m: any) => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', gap: '2px', justifyContent: 'center' }}>
                    <div style={{ width: '40%', height: `${Math.max((m.credit / maxBar) * 80, 3)}px`, background: 'linear-gradient(180deg, #34d399, #10b981)', borderRadius: '4px 4px 0 0' }} />
                    <div style={{ width: '40%', height: `${Math.max((m.debit  / maxBar) * 80, 3)}px`, background: 'linear-gradient(180deg, #f87171, #ef4444)', borderRadius: '4px 4px 0 0' }} />
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '5px', whiteSpace: 'nowrap' }}>{monthLabel(m.month)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div style={aiCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--ai)' }}>✦</span>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ai)', margin: 0 }}>AI Insight</h3>
        </div>
        {insightLoading
          ? <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Analysing your spending…</p>
          : insightError
            ? <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Could not reach the AI model — check PlatformAI is configured.</p>
            : <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>{insight}</p>
        }
      </div>

      {/* Recent transactions */}
      <div className="sv-card" style={card}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Recent Transactions</h3>
        {transactions.length === 0 ? <Empty text="No transactions yet" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {transactions.slice(0, 9).map((t: any) => (
              <div key={t.id} className="sv-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)', border: '1px solid var(--hair)' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: (CAT_COLORS[t.category] || '#6b7280') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>{CAT_EMOJI[t.category] || '•'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.category} · {t.date}</div>
                </div>
                <div className="tnum" style={{ fontSize: '12px', fontWeight: 600, color: t.type === 'credit' ? '#10b981' : '#ef4444', flexShrink: 0 }}>{t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transactions ──────────────────────────────────────────────────────────────
function TransactionsTab({ month, onMonthChange }: { month: string; onMonthChange: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [catF, setCatF] = useState('')
  const [typeF, setTypeF] = useState('')
  const [mth, setMth] = useState(month)

  useEffect(() => { setMth(month) }, [month])

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (mth)  p.set('month', mth)
    if (catF) p.set('category', catF)
    if (typeF) p.set('type', typeF)
    if (q)    p.set('q', q)
    fetch(`/api/selvam/transactions?${p}`).then(r => r.json()).then(d => setRows(d.transactions ?? []))
  }, [mth, catF, typeF, q])

  useEffect(() => { load() }, [load])

  const del = (id: number) => fetch(`/api/selvam/transactions/${id}`, { method: 'DELETE' }).then(load)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="sv-txfilter" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center', background: 'var(--panel)' }}>
        <div className="sv-search" style={{ position: 'relative', flex: '1 1 180px', maxWidth: '220px' }}>
          <Search size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...iStyle, paddingLeft: '30px' }} />
        </div>
        <MonthNav value={mth} onChange={m => { setMth(m); onMonthChange(m) }} />
        <select value={catF} onChange={e => setCatF(e.target.value)} style={{ ...iStyle, flex: '0 0 auto', width: 'auto' }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={{ ...iStyle, flex: '0 0 auto', width: 'auto' }}>
          <option value="">All Types</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </select>
      </div>

      <div className="tp-dock-pad" style={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}><Empty text="No transactions found" /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date', 'Description', 'Category', 'Type', 'Amount', ''].map(h => (
                <th key={h} style={{ padding: '11px 20px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: h === 'Amount' ? 'right' : 'left', borderBottom: '1px solid var(--border)', letterSpacing: '0.05em', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 1 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((t: any) => (
                <tr key={t.id} className="sv-trow" style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td className="tnum" style={{ padding: '11px 20px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ padding: '11px 20px', fontSize: '12px', color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                  <td style={{ padding: '11px 20px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '999px', background: (CAT_COLORS[t.category] || '#9ca3af') + '22', color: CAT_COLORS[t.category] || '#9ca3af', fontWeight: 500 }}>{t.category}</span>
                  </td>
                  <td style={{ padding: '11px 20px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '999px', background: t.type === 'credit' ? '#10b98120' : '#ef444420', color: t.type === 'credit' ? '#10b981' : '#ef4444', fontWeight: 500 }}>{t.type}</span>
                  </td>
                  <td className="tnum" style={{ padding: '11px 20px', fontSize: '13px', fontWeight: 600, color: t.type === 'credit' ? '#10b981' : '#ef4444', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'center' }}>
                    <button onClick={() => del(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', lineHeight: 0 }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Analytics ─────────────────────────────────────────────────────────────────
function AnalyticsTab({ month }: { month: string }) {
  const [monthly, setMonthly] = useState<any[]>([])
  const [cats, setCats] = useState<any[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [askQ, setAskQ] = useState('')
  const [askedQ, setAskedQ] = useState<string | null>(null)
  const [askAnswer, setAskAnswer] = useState<string | null>(null)
  const [askLoading, setAskLoading] = useState(false)

  useEffect(() => {
    fetch('/api/selvam/monthly?months=6').then(r => r.json()).then(setMonthly)
    fetch(`/api/selvam/transactions?month=${month}`).then(r => r.json()).then(d => setCats(d.summary?.by_category ?? []))
  }, [month])

  const handleAsk = async () => {
    const q = askQ.trim()
    if (!q || askLoading) return
    setAskLoading(true)
    setAskAnswer(null)
    setAskedQ(q)
    setAskQ('')
    try {
      const res = await fetch('/api/selvam/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, month }) })
      const d = await res.json()
      setAskAnswer(d.answer ?? 'No answer returned.')
    } catch {
      setAskAnswer('Could not reach AI — make sure the local model is running.')
    } finally {
      setAskLoading(false)
    }
  }

  const maxBar = Math.max(...monthly.flatMap((m: any) => [m.credit, m.debit]), 1)
  const totalSpend = cats.reduce((s: number, c: any) => s + c.amount, 0)

  let cum = 0
  const segs = cats.slice(0, 8).map((c: any) => {
    const pct = totalSpend > 0 ? (c.amount / totalSpend) * 100 : 0
    const s = { ...c, pct, start: cum }
    cum += pct
    return s
  })
  const donut = segs.map(s => `${CAT_COLORS[s.category] || '#9ca3af'} ${s.start.toFixed(1)}% ${(s.start + s.pct).toFixed(1)}%`).join(', ')

  return (
    <div className="tp-dock-pad" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div className="sv-card sv-card-hover" style={{ ...card, padding: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Monthly Overview</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Last 6 months &nbsp;
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981', display: 'inline-block' }} /> Income</span>
          &nbsp;&nbsp;
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#ef4444', display: 'inline-block' }} /> Expenses</span>
        </p>
        {monthly.length === 0 ? <Empty text="No data yet — import transactions to see charts" /> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '160px' }}>
            {monthly.map((m: any) => {
              const isHov = hovered === m.month
              return (
                <div key={m.month}
                  onMouseEnter={() => setHovered(m.month)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', position: 'relative', cursor: 'default' }}>
                  {/* Tooltip */}
                  {isHov && (
                    <div style={{
                      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                      marginBottom: '6px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                      borderRadius: '8px', padding: '8px 12px', whiteSpace: 'nowrap', zIndex: 10,
                      boxShadow: 'var(--sh-2)',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textAlign: 'center' }}>{monthFull(m.month)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: '#10b981', display: 'inline-block' }} /> Income
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>+{fmt(m.credit)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: '#ef4444', display: 'inline-block' }} /> Expenses
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>-{fmt(m.debit)}</span>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: '2px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Net</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: m.credit >= m.debit ? '#10b981' : '#ef4444' }}>
                            {m.credit >= m.debit ? '+' : '-'}{fmt(Math.abs(m.credit - m.debit))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', gap: '3px', justifyContent: 'center' }}>
                    <div style={{ width: '42%', height: `${Math.max((m.credit / maxBar) * 140, 3)}px`, background: isHov ? '#34d399' : 'linear-gradient(180deg, #34d399, #10b981)', borderRadius: '5px 5px 0 0', transition: 'background 0.15s' }} />
                    <div style={{ width: '42%', height: `${Math.max((m.debit  / maxBar) * 140, 3)}px`, background: isHov ? '#f87171' : 'linear-gradient(180deg, #f87171, #ef4444)', borderRadius: '5px 5px 0 0', transition: 'background 0.15s' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: isHov ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '6px', transition: 'color 0.15s' }}>{monthLabel(m.month)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="sv-card sv-card-hover" style={{ ...card, padding: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Spending Breakdown</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{monthFull(month)} by category</p>
        {cats.length === 0 ? <Empty text="No spending data for this month" /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '36px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '168px', height: '168px', flexShrink: 0 }}>
              <div className="sv-donut" style={{ width: '168px', height: '168px', borderRadius: '50%', background: totalSpend > 0 ? `conic-gradient(${donut})` : 'var(--border)', boxShadow: 'var(--sh-2)' }} />
              <div style={{ position: 'absolute', inset: '30px', borderRadius: '50%', background: 'var(--panel)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.12)' }}>
                <div className="font-display tnum" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{fmt(totalSpend)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>spent</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {segs.map((s: any) => (
                <div key={s.category} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COLORS[s.category] || '#9ca3af', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{s.category}</span>
                  <span className="tnum" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(s.amount)}</span>
                  <span className="tnum" style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'right' }}>{s.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AnalysisCards />

      {/* Ask AI */}
      <div style={aiCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--ai)' }}>✦</span>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ai)', margin: 0 }}>Ask AI about your finances</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={askQ}
            onChange={e => setAskQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="e.g. How much did I spend on food last month?"
            style={{ ...iStyle, flex: 1, height: '38px', background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--ai) 35%, var(--border))' }}
          />
          <button
            onClick={handleAsk}
            disabled={askLoading || !askQ.trim()}
            style={{ height: '38px', padding: '0 18px', borderRadius: 'var(--radius-sm)', background: askLoading || !askQ.trim() ? 'color-mix(in srgb, var(--ai) 35%, transparent)' : 'var(--ai)', color: '#fff', border: 'none', cursor: askLoading || !askQ.trim() ? 'default' : 'pointer', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}
          >
            {askLoading ? '…' : 'Ask'}
          </button>
        </div>
        {(askLoading || askAnswer) && (
          <div style={{ margin: '12px 0 0', borderTop: '1px solid color-mix(in srgb, var(--ai) 20%, var(--border))', paddingTop: '12px' }}>
            {askedQ && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px' }}>{askedQ}</p>
            )}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              {askAnswer ? renderMarkdown(askAnswer) : 'Thinking…'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Budgets ───────────────────────────────────────────────────────────────────
function BudgetsTab({ month }: { month: string }) {
  const [budgets, setBudgets] = useState<any[]>([])
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [showForm, setShowForm] = useState(false)
  const [newCat, setNewCat] = useState(CATEGORIES[0])
  const [newAmt, setNewAmt] = useState('')

  const load = useCallback(() => {
    fetch(`/api/selvam/budgets?month=${month}`).then(r => r.json()).then(setBudgets)
    fetch(`/api/selvam/transactions?month=${month}`).then(r => r.json()).then(d => {
      const map: Record<string, number> = {}
      for (const c of (d.summary?.by_category ?? [])) map[c.category] = c.amount
      setSpending(map)
    })
  }, [month])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!newAmt || isNaN(+newAmt)) return
    await fetch('/api/selvam/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: newCat, amount: +newAmt, month }) })
    setShowForm(false); setNewAmt(''); load()
  }

  return (
    <div className="tp-dock-pad" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 className="font-display" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Monthly Budgets</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Track spending against your limits</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={btn()}>
          <Plus size={13} /> Add Budget
        </button>
      </div>

      {showForm && (
        <div className="sv-card sv-budgetform" style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>CATEGORY</label>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} style={iStyle}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>AMOUNT (₹)</label>
            <input type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)} placeholder="e.g. 5000" style={iStyle} />
          </div>
          <button onClick={save} style={btn()}>Save</button>
          <button onClick={() => setShowForm(false)} style={{ height: '34px', padding: '0 14px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      <SpendingPlan onApplied={load} />

      {budgets.length === 0
        ? <Empty text="No budgets set. Add one to start tracking your spending limits." />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {budgets.map((b: any) => {
              const spent = spending[b.category] || 0
              const pct = Math.min((spent / b.amount) * 100, 100)
              const over = spent > b.amount
              const bar = over ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981'
              return (
                <div key={b.id} className="sv-card sv-card-hover" style={{ ...card, padding: '15px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: CAT_COLORS[b.category] || '#9ca3af' }} />
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{b.category}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="tnum" style={{ fontSize: '12px', color: over ? '#ef4444' : 'var(--text-muted)' }}>{fmt(spent)} / {fmt(b.amount)}</span>
                      <span className="tnum" style={{ fontSize: '12px', fontWeight: 700, color: bar, minWidth: '36px', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      <button onClick={() => fetch(`/api/selvam/budgets/${b.id}`, { method: 'DELETE' }).then(load)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div style={{ height: '8px', background: 'var(--surface-1)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: bar, borderRadius: '999px', transition: 'width 0.5s cubic-bezier(.2,.7,.2,1)' }} />
                  </div>
                  {over && <p style={{ fontSize: '11px', color: '#ef4444', margin: '6px 0 0' }}>Over budget by {fmt(spent - b.amount)}</p>}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ── Import ────────────────────────────────────────────────────────────────────
function ImportTab({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<any[]>([])
  const [stage, setStage] = useState<'idle' | 'parsing' | 'preview' | 'done'>('idle')
  const [count, setCount] = useState(0)
  const [parseError, setParseError] = useState('')
  const [manual, setManual] = useState({ date: '', description: '', amount: '', type: 'debit', category: CATEGORIES[0] })
  const [showManual, setShowManual] = useState(false)
  const [sources, setSources] = useState<{ source: string; count: number; min_date: string; max_date: string }[]>([])
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [recat, setRecat] = useState<{ busy: boolean; result: string }>({ busy: false, result: '' })

  const recategorise = async () => {
    setRecat({ busy: true, result: '' })
    try {
      const res = await fetch('/api/selvam/recategorise', { method: 'POST' })
      const d = await res.json()
      setRecat({
        busy: false,
        result: res.ok
          ? d.updated === 0
            ? `Checked ${d.scanned} transactions — nothing to change.`
            : `Recategorised ${d.updated} of ${d.scanned} transactions.`
          : d.error ?? 'Could not recategorise',
      })
      if (res.ok && d.updated > 0) onDone()
    } catch {
      setRecat({ busy: false, result: 'Network error — please try again' })
    }
  }

  const loadSources = useCallback(() => {
    fetch('/api/selvam/imports').then(r => r.json()).then(d => setSources(d.sources ?? []))
  }, [])

  useEffect(() => { loadSources() }, [loadSources])

  const deleteSource = async (source: string) => {
    setDeleting(source); setConfirmDel(null)
    await fetch(`/api/selvam/imports?source=${encodeURIComponent(source)}`, { method: 'DELETE' })
    setDeleting(null); loadSources(); onDone()
  }

  const parseCSV = (text: string, src: string) => {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return []
    const cols = lines[0].toLowerCase().replace(/"/g, '').split(',').map(c => c.trim())
    const fi = (...ns: string[]) => { for (const n of ns) { const i = cols.findIndex(c => c.includes(n)); if (i !== -1) return i } return -1 }
    const dateI = fi('date'), descI = fi('particulars','description','narration','details'), amtI = fi('amount'), debitI = fi('debit','withdrawal'), creditI = fi('credit','deposit'), typeI = fi('type')
    const pd = (d: string) => {
      d = d.replace(/"/g, '').trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}` }
      if (/^\d{2}-\d{2}-\d{4}$/.test(d)) { const [dd, mm, yy] = d.split('-'); return `${yy}-${mm}-${dd}` }
      const mo: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'}
      const m = d.match(/(\d{1,2})[\s-]([a-z]{3})[\s,]*(\d{4})/i)
      if (m) return `${m[3]}-${mo[m[2].toLowerCase()]||'01'}-${m[1].padStart(2,'0')}`
      const p = new Date(d); return isNaN(p.getTime()) ? d : p.toISOString().slice(0,10)
    }
    const pa = (s: string) => Math.abs(parseFloat(s.replace(/[₹,"' ]/g,'').trim()) || 0)
    return lines.slice(1).map((line, i) => {
      const parts: string[] = []; let cur = '', inQ = false
      for (const ch of line) { if (ch==='"') inQ=!inQ; else if (ch===','&&!inQ) { parts.push(cur); cur='' } else cur+=ch }
      parts.push(cur)
      const date = dateI !== -1 ? pd(parts[dateI]||'') : ''
      const description = (descI !== -1 ? parts[descI]||'' : `Transaction ${i+1}`).replace(/^["']|["']$/g,'').trim()
      let amount = 0, type: 'debit'|'credit' = 'debit'
      if (debitI !== -1 && creditI !== -1) {
        const d = pa(parts[debitI]||''), c = pa(parts[creditI]||'')
        if (c > 0) { amount = c; type = 'credit' } else { amount = d; type = 'debit' }
      } else if (amtI !== -1) {
        const raw = (parts[amtI]||'').replace(/[₹,"' ]/g,'').trim()
        amount = Math.abs(parseFloat(raw)||0)
        type = typeI !== -1 ? ((parts[typeI]||'').toLowerCase().includes('credit') ? 'credit' : 'debit') : (raw.startsWith('-') ? 'debit' : 'credit')
      }
      if (!date || !description || amount === 0) return null
      return { date, description, amount, type, category: keywordCategory(description) ?? 'Other', source: src }
    }).filter(Boolean)
  }

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>, src: string) => {
    const file = e.target.files?.[0]; if (!file) return
    const r = new FileReader()
    r.onload = ev => { const rows = parseCSV(ev.target?.result as string, src); if (rows.length) { setPreview(rows); setStage('preview') } }
    r.readAsText(file); e.target.value = ''
  }

  const handlePDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    setStage('parsing'); setParseError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/selvam/parse-pdf', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setParseError(data.error || 'Failed to parse PDF'); setStage('idle'); return }
      setPreview(data.transactions); setStage('preview')
    } catch {
      setParseError('Network error — please try again'); setStage('idle')
    }
  }

  const handleXLSX = async (e: React.ChangeEvent<HTMLInputElement>, source = 'bank') => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    setStage('parsing'); setParseError('')
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('source', source)
      const res = await fetch('/api/selvam/parse-xlsx', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setParseError(data.error || 'Failed to parse XLSX'); setStage('idle'); return }
      setPreview(data.transactions); setStage('preview')
    } catch {
      setParseError('Network error — please try again'); setStage('idle')
    }
  }

  const doImport = async () => {
    const res = await fetch('/api/selvam/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: preview }) })
    const d = await res.json(); setCount(d.count); setStage('done'); loadSources()
  }

  const addManual = async () => {
    const { date, description, amount, type, category } = manual
    if (!date || !description || !amount) return
    await fetch('/api/selvam/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, description, amount: +amount, type, category, source: 'manual' }) })
    setManual({ date: '', description: '', amount: '', type: 'debit', category: CATEGORIES[0] }); setShowManual(false); onDone()
  }

  if (stage === 'parsing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
      <div style={{ width: '44px', height: '44px', border: '3px solid var(--border)', borderTop: '3px solid var(--app-selvam)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Parsing your statement…</p>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Extracting and categorizing transactions</p>
    </div>
  )

  if (stage === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
      <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#10b98120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#10b981' }}>✓</div>
      <h3 className="font-display" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Imported {count} transactions</h3>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onDone} style={{ ...btn(), height: '38px', padding: '0 18px', fontSize: '13px' }}>View Transactions</button>
        <button onClick={() => { setStage('idle'); setPreview([]) }} style={{ padding: '0 18px', height: '38px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}>Import More</button>
      </div>
    </div>
  )

  if (stage === 'preview') return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="sv-preview-head" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Preview — {preview.length} transactions</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Auto-categorized. Change any category before importing.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setStage('idle'); setPreview([]) }} style={{ padding: '0 14px', height: '34px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={doImport} style={btn()}>Import All</button>
        </div>
      </div>
      <div className="tp-dock-pad" style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date','Description','Category','Type','Amount'].map(h => <th key={h} style={{ padding: '11px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, background: 'var(--surface-1)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {preview.map((t: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                <td style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                <td style={{ padding: '8px 16px' }}>
                  <select value={t.category} onChange={e => setPreview(p => p.map((r, j) => j === i ? { ...r, category: e.target.value } : r))} style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px 16px', fontSize: '11px', color: t.type === 'credit' ? '#10b981' : '#ef4444' }}>{t.type}</td>
                <td style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: t.type === 'credit' ? '#10b981' : '#ef4444' }}>{t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="tp-dock-pad" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {parseError && (
        <div style={{ padding: '10px 14px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: '8px', fontSize: '12px', color: '#ef4444' }}>{parseError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
      {/* Google Pay — PDF + CSV */}
      <div className="sv-card sv-card-hover" style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>G</div>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Google Pay</span>
            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#10b981', fontWeight: 500, background: '#10b98115', padding: '2px 7px', borderRadius: '4px' }}>PDF supported</span>
          </div>
        </div>
        <ol style={{ margin: '0 0 16px', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {['Open Google Pay → Profile → Statements & Passbook', 'Tap the download icon → select date range', 'Save the PDF and upload it below'].map((s, i) => (
            <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s}</li>
          ))}
        </ol>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: '#4285F418', border: '1px solid #4285F444', borderRadius: '8px', cursor: 'pointer' }}>
            <FileText size={13} color="#4285F4" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#4285F4' }}>Upload PDF</span>
            <input type="file" accept=".pdf" onChange={handlePDF} style={{ display: 'none' }} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
            <Upload size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Upload CSV</span>
            <input type="file" accept=".csv,.txt" onChange={e => handleCSV(e, 'gpay')} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Paytm — XLSX + CSV */}
      <div className="sv-card sv-card-hover" style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#00BAF2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>P</div>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Paytm</span>
            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#10b981', fontWeight: 500, background: '#10b98115', padding: '2px 7px', borderRadius: '4px' }}>XLSX supported</span>
          </div>
        </div>
        <ol style={{ margin: '0 0 16px', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {['Open Paytm → Passbook tab → View all transactions', 'Tap "Download Statement" → select date range', 'Download the XLSX file and upload below'].map((s, i) => (
            <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s}</li>
          ))}
        </ol>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: '#00BAF218', border: '1px solid #00BAF244', borderRadius: '8px', cursor: 'pointer' }}>
            <FileText size={13} color="#00BAF2" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#00BAF2' }}>Upload XLSX</span>
            <input type="file" accept=".xlsx,.xls" onChange={e => handleXLSX(e, 'paytm')} style={{ display: 'none' }} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
            <Upload size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Upload CSV</span>
            <input type="file" accept=".csv,.txt" onChange={e => handleCSV(e, 'paytm')} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Bank Statement — XLSX + CSV */}
      <div className="sv-card sv-card-hover" style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>🏦</div>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Bank Statement</span>
            <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--border)' }}>ICICI · HDFC · SBI · Axis</span>
          </div>
        </div>
        <ol style={{ margin: '0 0 16px', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            'Log in to your net banking app',
            'Go to Account Statement → select date range',
            'Download as Excel or CSV and upload below',
            'Covers all UPI, NEFT, ATM, and card transactions',
          ].map((s, i) => (
            <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s}</li>
          ))}
        </ol>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: '#6366f118', border: '1px solid #6366f144', borderRadius: '8px', cursor: 'pointer' }}>
            <FileText size={13} color="#6366f1" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1' }}>Upload Excel</span>
            <input type="file" accept=".xlsx,.xls" onChange={e => handleXLSX(e, 'bank')} style={{ display: 'none' }} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
            <Upload size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Upload CSV</span>
            <input type="file" accept=".csv,.txt" onChange={e => handleCSV(e, 'bank')} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
      </div>

      <div>
        <button onClick={() => setShowManual(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', height: '34px', background: 'var(--panel)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', boxShadow: 'var(--sh-1)' }}>
          <Plus size={13} /> Add Transaction Manually
        </button>
        {showManual && (
          <div className="sv-card sv-manualform" style={{ ...card, marginTop: '12px', display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 1fr auto', gap: '10px', alignItems: 'end' }}>
            {[
              { label: 'DATE',        el: <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))} style={iStyle} /> },
              { label: 'DESCRIPTION', el: <input value={manual.description} onChange={e => setManual(m => ({ ...m, description: e.target.value }))} placeholder="e.g. Swiggy" style={iStyle} /> },
              { label: 'AMOUNT (₹)',  el: <input type="number" value={manual.amount} onChange={e => setManual(m => ({ ...m, amount: e.target.value }))} placeholder="0" style={iStyle} /> },
              { label: 'TYPE',        el: <select value={manual.type} onChange={e => setManual(m => ({ ...m, type: e.target.value }))} style={iStyle}><option value="debit">Debit</option><option value="credit">Credit</option></select> },
              { label: 'CATEGORY',    el: <select value={manual.category} onChange={e => setManual(m => ({ ...m, category: e.target.value }))} style={iStyle}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select> },
            ].map(({ label, el }) => (
              <div key={label}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>{label}</label>
                {el}
              </div>
            ))}
            <button onClick={addManual} style={btn()}>Add</button>
          </div>
        )}
      </div>

      {/* Recategorise */}
      <div className="sv-card" style={{ ...card, padding: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Recategorise existing</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
          Categories are now decided once per payee, so the same merchant can no longer land in a
          different bucket each month. Already-imported transactions keep their old categories until
          you run this. It overwrites any you changed by hand.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={recategorise}
            disabled={recat.busy}
            style={btn(recat.busy)}
          >
            {recat.busy ? 'Working…' : 'Recategorise all'}
          </button>
          {recat.result && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{recat.result}</span>}
        </div>
      </div>

      {/* Manage Imports */}
      {sources.length > 0 && (
        <div className="sv-card" style={{ ...card, padding: '20px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Manage Imports</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 14px' }}>Delete all transactions from a specific import source</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sources.map(s => {
              const label: Record<string, string> = { gpay: 'Google Pay', paytm: 'Paytm', bank: 'Bank Statement', manual: 'Manual Entry' }
              const color: Record<string, string> = { gpay: '#4285F4', paytm: '#00BAF2', bank: '#6366f1', manual: '#10b981' }
              const name = label[s.source] ?? s.source
              const c = color[s.source] ?? '#6b7280'
              const isConfirming = confirmDel === s.source
              const isDeleting   = deleting === s.source
              return (
                <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: isConfirming ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.count} transactions · {s.min_date} → {s.max_date}</div>
                  </div>
                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#ef4444' }}>Delete {s.count} transactions?</span>
                      <button onClick={() => deleteSource(s.source)} style={{ padding: '4px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Yes, delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ padding: '4px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(s.source)} disabled={isDeleting} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '11px', cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.5 : 1 }}>
                      <Trash2 size={11} /> {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [month, setMonth] = useState(thisMonth)

  // Open on the most recent month that actually has data, not the calendar month.
  // Early in a new month there are no transactions yet, so anchoring every
  // month-scoped view (and Ask AI) to an empty "this month" made the app read blank.
  useEffect(() => {
    fetch('/api/selvam/monthly?months=1')
      .then(r => r.json())
      .then((ms: any[]) => { if (Array.isArray(ms) && ms.length) setMonth(ms[ms.length - 1].month) })
      .catch(() => {})
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .sv-bento { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; align-items: stretch; }
        .sv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .sv-card-hover { transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s, border-color .3s; }
        .sv-card-hover:hover { transform: translateY(-4px); box-shadow: var(--sh-3); border-color: color-mix(in srgb, var(--app-selvam) 40%, var(--border)); }
        .sv-trow { transition: background .15s; }
        .sv-trow:hover { background: var(--surface-1); }
        .sv-row:hover { border-color: color-mix(in srgb, var(--app-selvam) 35%, var(--border)); }
        .sv-tab:hover { color: var(--text-secondary); }
        @keyframes sv-draw { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
        .sv-donut { animation: sv-draw .55s cubic-bezier(.2,.7,.2,1) both; }
        @media (max-width: 760px) { .sv-bento, .sv-grid-2 { grid-template-columns: 1fr; } }
        @media (max-width: 767px) {
          /* Top bar: let it wrap. Logo + month nav on line 1, tabs become a
             horizontal-scroll strip on line 2 — no fixed 48px clip, no page scroll. */
          .sv-topbar { height: auto !important; flex-wrap: wrap; row-gap: 8px; padding: 8px 14px !important; }
          .sv-tabstrip { order: 3; flex: 0 0 100% !important; flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; min-width: 0; }
          .sv-tabstrip > button { flex-shrink: 0; }
          /* Transactions filter: full-width search, selects/month nav wrap below. */
          .sv-search { flex: 1 1 100% !important; max-width: none !important; }
          /* Forms whose fixed pixel columns exceed the viewport → two columns. */
          .sv-budgetform, .sv-manualform { grid-template-columns: 1fr 1fr !important; }
          .sv-preview-head { flex-wrap: wrap; gap: 10px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sv-card-hover, .sv-trow, .sv-row { transition: none !important; }
          .sv-card-hover:hover { transform: none !important; }
          .sv-donut { animation: none !important; }
        }
      `}</style>
      <div className="sv-topbar" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', height: '48px', boxShadow: 'var(--sh-1)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginRight: '6px', flexShrink: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: 'var(--app-selvam)', boxShadow: `var(--tile-glow) var(--app-selvam)` }} />
          <span className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Selvam</span>
        </span>
        <div className="sv-tabstrip" style={{ display: 'flex', gap: '2px', flex: 1, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} className="sv-tab" onClick={() => setTab(t)} style={{ padding: '6px 13px', background: tab === t ? 'color-mix(in srgb, var(--app-selvam) 14%, transparent)' : 'transparent', color: tab === t ? 'var(--app-selvam)' : 'var(--text-muted)', border: 'none', borderRadius: '999px', fontSize: '12px', fontWeight: tab === t ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s' }}>{t}</button>
          ))}
        </div>
        {(tab === 'Overview' || tab === 'Budgets' || tab === 'Analytics') && (
          <MonthNav value={month} onChange={setMonth} />
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'Overview'     && <OverviewTab month={month} />}
        {tab === 'Transactions' && <TransactionsTab month={month} onMonthChange={setMonth} />}
        {tab === 'Analytics'    && <AnalyticsTab month={month} />}
        {tab === 'Budgets'      && <BudgetsTab month={month} />}
        {tab === 'Import'       && <ImportTab onDone={() => setTab('Transactions')} />}
      </div>
    </div>
  )
}
