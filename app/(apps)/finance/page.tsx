'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Receipt, Upload, Plus, Trash2, Search, FileText } from 'lucide-react'

type Tab = 'Overview' | 'Transactions' | 'Analytics' | 'Budgets' | 'Import'
const TABS: Tab[] = ['Overview', 'Transactions', 'Analytics', 'Budgets', 'Import']

const CATEGORIES = ['Food & Dining', 'Transport', 'Shopping', 'Utilities', 'Entertainment', 'Healthcare', 'Finance', 'Education', 'Transfers', 'Other']

const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#f97316', 'Transport': '#3b82f6', 'Shopping': '#ec4899',
  'Utilities': '#06b6d4', 'Entertainment': '#8b5cf6', 'Healthcare': '#10b981',
  'Finance': '#6366f1', 'Education': '#f59e0b', 'Transfers': '#6b7280', 'Other': '#9ca3af',
}

const CAT_EMOJI: Record<string, string> = {
  'Food & Dining': '🍽', 'Transport': '🚗', 'Shopping': '🛍', 'Utilities': '💡',
  'Entertainment': '🎬', 'Healthcare': '💊', 'Finance': '🏦', 'Education': '📚',
  'Transfers': '💸', 'Other': '•',
}

const CAT_KW: [string, string[]][] = [
  ['Food & Dining', ['swiggy','zomato','dominos','mcdonald','pizza','restaurant','cafe','blinkit','dunzo','zepto','bigbasket','kfc','burger','subway']],
  ['Transport', ['ola','uber','rapido','metro','irctc','redbus','makemytrip','fuel','petrol','diesel','bounce','yulu','flight','cab']],
  ['Shopping', ['amazon','flipkart','myntra','ajio','nykaa','meesho','snapdeal','reliance','croma','decathlon']],
  ['Utilities', ['airtel','jio','bsnl','vodafone','electricity','bescom','water','gas','recharge','dth','tata sky','internet','broadband']],
  ['Entertainment', ['netflix','spotify','amazon prime','hotstar','disney','bookmyshow','pvr','inox','zee5','gaana','steam']],
  ['Healthcare', ['pharmacy','hospital','clinic','doctor','apollo','medplus','pharmeasy','1mg','netmeds','chemist','medical']],
  ['Finance', ['insurance','emi','loan','sip','mutual fund','policy','premium','lic','ppf','fixed deposit']],
  ['Education', ['course','udemy','coursera','byju','unacademy','vedantu','upgrad','tuition','books']],
  ['Transfers', ['transfer','neft','imps','rtgs','sent to','received from','cashback','refund']],
]

function autocat(desc: string): string {
  const low = desc.toLowerCase()
  for (const [cat, kw] of CAT_KW) if (kw.some(k => low.includes(k))) return cat
  return 'Other'
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
      <button onClick={() => onChange(stepMonth(value, -1))} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1 }}>‹</button>
      <span style={{ padding: '0 10px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>{monthFull(value)}</span>
      <button onClick={() => !atMax && onChange(stepMonth(value, 1))} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: atMax ? 'default' : 'pointer', color: atMax ? 'var(--border)' : 'var(--text-muted)', fontSize: '13px', lineHeight: 1 }}>›</button>
    </div>
  )
}

const iStyle: React.CSSProperties = { width: '100%', height: '34px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, padding: '32px 0', textAlign: 'center' }}>{text}</p>
}

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ month }: { month: string }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    fetch(`/api/finance/transactions?month=${month}`).then(r => r.json()).then(setData)
  }, [month])

  if (!data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>

  const { transactions = [], summary } = data
  const { credit = 0, debit = 0, count = 0, by_category = [] } = summary ?? {}
  const net = credit - debit
  const maxCat = Math.max(...by_category.map((c: any) => c.amount), 1)

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {[
          { label: 'Income', value: fmt(credit), color: '#10b981', Icon: ArrowDownCircle },
          { label: 'Expenses', value: fmt(debit), color: '#ef4444', Icon: ArrowUpCircle },
          { label: 'Net', value: fmt(net), color: net >= 0 ? '#10b981' : '#ef4444', Icon: TrendingUp },
          { label: 'Transactions', value: String(count), color: '#6366f1', Icon: Receipt },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              <Icon size={15} color={color} />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Recent Transactions</h3>
          {transactions.length === 0 ? <Empty text="No transactions yet" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {transactions.slice(0, 8).map((t: any) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: (CAT_COLORS[t.category] || '#6b7280') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{CAT_EMOJI[t.category] || '•'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.category} · {t.date}</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: t.type === 'credit' ? '#10b981' : '#ef4444', flexShrink: 0 }}>{t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Top Spending</h3>
          {by_category.length === 0 ? <Empty text="No spending data" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {by_category.slice(0, 6).map((c: any) => (
                <div key={c.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.category}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(c.amount)}</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.amount / maxCat) * 100}%`, background: CAT_COLORS[c.category] || '#6b7280', borderRadius: '2px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
    fetch(`/api/finance/transactions?${p}`).then(r => r.json()).then(d => setRows(d.transactions ?? []))
  }, [mth, catF, typeF, q])

  useEffect(() => { load() }, [load])

  const del = (id: number) => fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' }).then(load)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: '220px' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...iStyle, paddingLeft: '28px' }} />
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}><Empty text="No transactions found" /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date', 'Description', 'Category', 'Type', 'Amount', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: h === 'Amount' ? 'right' : 'left', borderBottom: '1px solid var(--border)', letterSpacing: '0.05em', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((t: any) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: (CAT_COLORS[t.category] || '#9ca3af') + '22', color: CAT_COLORS[t.category] || '#9ca3af', fontWeight: 500 }}>{t.category}</span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: t.type === 'credit' ? '#10b98120' : '#ef444420', color: t.type === 'credit' ? '#10b981' : '#ef4444', fontWeight: 500 }}>{t.type}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: t.type === 'credit' ? '#10b981' : '#ef4444', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
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
function AnalyticsTab() {
  const [monthly, setMonthly] = useState<any[]>([])
  const [cats, setCats] = useState<any[]>([])
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/finance/monthly?months=6').then(r => r.json()).then(setMonthly)
    fetch(`/api/finance/transactions?month=${thisMonth()}`).then(r => r.json()).then(d => setCats(d.summary?.by_category ?? []))
  }, [])

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
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
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
                      marginBottom: '6px', background: '#1e2128', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px', padding: '8px 12px', whiteSpace: 'nowrap', zIndex: 10,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
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
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '2px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Net</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: m.credit >= m.debit ? '#10b981' : '#ef4444' }}>
                            {m.credit >= m.debit ? '+' : '-'}{fmt(Math.abs(m.credit - m.debit))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', gap: '3px', justifyContent: 'center' }}>
                    <div style={{ width: '42%', height: `${Math.max((m.credit / maxBar) * 140, 3)}px`, background: isHov ? '#34d399' : '#10b981', borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }} />
                    <div style={{ width: '42%', height: `${Math.max((m.debit  / maxBar) * 140, 3)}px`, background: isHov ? '#f87171' : '#ef4444', borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: isHov ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '6px', transition: 'color 0.15s' }}>{monthLabel(m.month)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Spending Breakdown</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>Current month by category</p>
        {cats.length === 0 ? <Empty text="No spending data for this month" /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }}>
            <div style={{ position: 'relative', width: '160px', height: '160px', flexShrink: 0 }}>
              <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: totalSpend > 0 ? `conic-gradient(${donut})` : 'var(--border)' }} />
              <div style={{ position: 'absolute', inset: '28px', borderRadius: '50%', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{fmt(totalSpend)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>spent</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {segs.map((s: any) => (
                <div key={s.category} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COLORS[s.category] || '#9ca3af', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{s.category}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(s.amount)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>{s.pct.toFixed(1)}%</span>
                </div>
              ))}
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
    fetch(`/api/finance/budgets?month=${month}`).then(r => r.json()).then(setBudgets)
    fetch(`/api/finance/transactions?month=${month}`).then(r => r.json()).then(d => {
      const map: Record<string, number> = {}
      for (const c of (d.summary?.by_category ?? [])) map[c.category] = c.amount
      setSpending(map)
    })
  }, [month])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!newAmt || isNaN(+newAmt)) return
    await fetch('/api/finance/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: newCat, amount: +newAmt, month }) })
    setShowForm(false); setNewAmt(''); load()
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Monthly Budgets</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Track spending against your limits</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Add Budget
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>CATEGORY</label>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} style={iStyle}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>AMOUNT (₹)</label>
            <input type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)} placeholder="e.g. 5000" style={iStyle} />
          </div>
          <button onClick={save} style={{ height: '34px', padding: '0 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
          <button onClick={() => setShowForm(false)} style={{ height: '34px', padding: '0 12px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

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
                <div key={b.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: CAT_COLORS[b.category] || '#9ca3af' }} />
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{b.category}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', color: over ? '#ef4444' : 'var(--text-muted)' }}>{fmt(spent)} / {fmt(b.amount)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: bar, minWidth: '36px', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      <button onClick={() => fetch(`/api/finance/budgets/${b.id}`, { method: 'DELETE' }).then(load)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: bar, borderRadius: '3px', transition: 'width 0.4s ease' }} />
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
      return { date, description, amount, type, category: autocat(description), source: src }
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
      const res = await fetch('/api/finance/parse-pdf', { method: 'POST', body: fd })
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
      const res = await fetch('/api/finance/parse-xlsx', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setParseError(data.error || 'Failed to parse XLSX'); setStage('idle'); return }
      setPreview(data.transactions); setStage('preview')
    } catch {
      setParseError('Network error — please try again'); setStage('idle')
    }
  }

  const doImport = async () => {
    const res = await fetch('/api/finance/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: preview }) })
    const d = await res.json(); setCount(d.count); setStage('done')
  }

  const addManual = async () => {
    const { date, description, amount, type, category } = manual
    if (!date || !description || !amount) return
    await fetch('/api/finance/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, description, amount: +amount, type, category, source: 'manual' }) })
    setManual({ date: '', description: '', amount: '', type: 'debit', category: CATEGORIES[0] }); setShowManual(false); onDone()
  }

  if (stage === 'parsing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
      <div style={{ width: '44px', height: '44px', border: '3px solid var(--border)', borderTop: '3px solid #4285F4', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Parsing your statement…</p>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Extracting and categorizing transactions</p>
    </div>
  )

  if (stage === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#10b98120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>✓</div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Imported {count} transactions</h3>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onDone} style={{ padding: '8px 18px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>View Transactions</button>
        <button onClick={() => { setStage('idle'); setPreview([]) }} style={{ padding: '8px 18px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Import More</button>
      </div>
    </div>
  )

  if (stage === 'preview') return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Preview — {preview.length} transactions</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Auto-categorized. Change any category before importing.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setStage('idle'); setPreview([]) }} style={{ padding: '7px 14px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={doImport} style={{ padding: '7px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Import All</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date','Description','Category','Type','Amount'].map(h => <th key={h} style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, background: 'var(--bg)' }}>{h}</th>)}</tr></thead>
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
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {parseError && (
        <div style={{ padding: '10px 14px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: '8px', fontSize: '12px', color: '#ef4444' }}>{parseError}</div>
      )}

      {/* Google Pay — PDF + CSV */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

      <div>
        <button onClick={() => setShowManual(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <Plus size={13} /> Add Transaction Manually
        </button>
        {showManual && (
          <div style={{ marginTop: '12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gridTemplateColumns: '140px 1fr 120px 120px 1fr auto', gap: '10px', alignItems: 'end' }}>
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
            <button onClick={addManual} style={{ height: '34px', padding: '0 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [month, setMonth] = useState(thisMonth)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', height: '44px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginRight: '8px', flexShrink: 0 }}>Finance</span>
        <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '5px 12px', background: tab === t ? 'var(--accent-bg)' : 'transparent', color: tab === t ? 'var(--accent)' : 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: tab === t ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>{t}</button>
          ))}
        </div>
        {(tab === 'Overview' || tab === 'Budgets') && (
          <MonthNav value={month} onChange={setMonth} />
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'Overview'     && <OverviewTab month={month} />}
        {tab === 'Transactions' && <TransactionsTab month={month} onMonthChange={setMonth} />}
        {tab === 'Analytics'    && <AnalyticsTab />}
        {tab === 'Budgets'      && <BudgetsTab month={month} />}
        {tab === 'Import'       && <ImportTab onDone={() => setTab('Transactions')} />}
      </div>
    </div>
  )
}
