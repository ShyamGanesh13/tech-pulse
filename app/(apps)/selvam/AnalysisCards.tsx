'use client'

// Derived views over the whole transaction history: regular payments, merchants,
// spending shape by weekday and by day, outliers, and next month's plan.
//
// All the arithmetic lives in lib/finance-analysis.ts and arrives from
// GET /api/selvam/analysis. This file only draws it — same hand-rolled divs the
// rest of Selvam uses, no chart library.
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Repeat, Store, CalendarDays, AlertTriangle, Wand2 } from 'lucide-react'
import { CAT_COLORS, Empty, fmt } from './ui'

interface Analysis {
  month: string
  rows: number
  recurring: { label: string; category: string; amount: number; monthsSeen: number; everyMonth: boolean; lastDate: string }[]
  topMerchants: { label: string; total: number; count: number }[]
  byDayOfWeek: { label: string; total: number; average: number }[]
  dailyTotals: Record<string, number>
  anomalies: { id: string; date: string; description: string; amount: number; category: string; reason: string }[]
  forecast: {
    month: string
    lines: { category: string; amount: number; monthsUsed: number; confidence: 'good' | 'fair' | 'low' }[]
    excluded: { category: string; amount: number }[]
    total: number
    committed: number
    expectedIncome: number
    completeMonths: string[]
  }
}

const card: React.CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '16px',
}
const h3: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }
const sub: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 14px' }

function useAnalysis() {
  const [data, setData] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/selvam/analysis')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not analyse your transactions')
        return d as Analysis
      })
      .then(d => { setData(d); setError('') })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}

function CardHeader({ Icon, title, note, color = '#6366f1' }: { Icon: typeof Repeat; title: string; note: string; color?: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={14} color={color} />
        <h3 style={h3}>{title}</h3>
      </div>
      <p style={sub}>{note}</p>
    </>
  )
}

/** A labelled bar, the shape used across Selvam for a proportion of a maximum. */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: '6px', background: 'var(--bg)', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(pct, 1.5)}%`, height: '100%', background: color, borderRadius: '3px' }} />
    </div>
  )
}

// ── Analytics tab ───────────────────────────────────────────────────────────

export function AnalysisCards() {
  const { data, error, loading } = useAnalysis()

  if (loading) return <div style={card}><p style={{ ...sub, margin: 0 }}>Reading your history…</p></div>
  if (error)   return <div style={{ ...card, borderColor: '#ef444440' }}><p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p></div>
  if (!data)   return null

  const maxMerchant = Math.max(...data.topMerchants.map(m => m.total), 1)
  const maxWeekday  = Math.max(...data.byDayOfWeek.map(d => d.average), 1)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Regular payments — deliberately not called "subscriptions": the
            detector finds anything charged steadily, which includes rent and
            the monthly SIP, not just services you could cancel. */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <CardHeader Icon={Repeat} title="Regular payments" note="Same payee, steady amount, three months or more" />
          {data.recurring.length === 0 ? <Empty text="No regular payments found yet — this needs a few months of history" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.recurring.map(r => (
                <div key={r.label + r.amount} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[r.category] ?? '#9ca3af', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {r.monthsSeen} months{r.everyMonth ? ' · every month' : ' · on and off'} · last {r.lastDate}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <CardHeader Icon={Store} title="Top merchants" note={`Where this month's money went`} color="#f59e0b" />
          {data.topMerchants.length === 0 ? <Empty text="No spending this month yet" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.topMerchants.map(m => (
                <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.count}×</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(m.total)}</span>
                  </div>
                  <Bar pct={(m.total / maxMerchant) * 100} color="#f59e0b" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <CardHeader Icon={CalendarDays} title="By day of week" note="Average spend per weekday across your history" color="#10b981" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.byDayOfWeek.map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '26px', flexShrink: 0 }}>{d.label}</span>
                <div style={{ flex: 1 }}><Bar pct={(d.average / maxWeekday) * 100} color="#10b981" /></div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', width: '64px', textAlign: 'right', flexShrink: 0 }}>{fmt(d.average)}</span>
              </div>
            ))}
          </div>
        </div>

        <CalendarHeatmap month={data.month} daily={data.dailyTotals} />
      </div>

      <div style={card}>
        <CardHeader Icon={AlertTriangle} title="Needs a look" note="Measured against your own habits, not a fixed limit" color="#ef4444" />
        {data.anomalies.length === 0 ? <Empty text="Nothing unusual this month" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.anomalies.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{a.date} · {a.reason}</div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', flexShrink: 0 }}>{fmt(a.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** Daily spend as a month grid, Monday-first, aligned to real weekdays. */
function CalendarHeatmap({ month, daily }: { month: string; daily: Record<string, number> }) {
  const [year, mon] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  // Monday-first: JS getUTCDay() is Sunday-based, so Sunday moves to the end.
  const firstDow = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7
  const max = Math.max(...Object.values(daily), 1)

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <CardHeader Icon={CalendarDays} title="Daily spend" note="Darker is more. Blank days had no spending." color="#6366f1" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>{d}</div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <div key={`pad${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`
          const amount = daily[date] ?? 0
          // Square-rooted so the ordinary days stay distinguishable from blank
          // ones when a single big day owns the top of the scale.
          const intensity = amount > 0 ? 0.18 + Math.sqrt(amount / max) * 0.82 : 0
          return (
            <div
              key={date}
              title={amount > 0 ? `${date}: ${fmt(amount)}` : date}
              style={{
                aspectRatio: '1', borderRadius: '4px',
                background: amount > 0 ? `rgba(99,102,241,${intensity.toFixed(2)})` : 'var(--bg)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', color: intensity > 0.55 ? '#fff' : 'var(--text-muted)',
              }}
            >
              {i + 1}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Budgets tab ─────────────────────────────────────────────────────────────

const CONFIDENCE_NOTE: Record<string, string> = {
  good: 'all 3 months',
  fair: '2 of 3 months',
  low: '1 of 3 months',
}

/**
 * Next month's plan, and a one-click way to turn it into budgets.
 *
 * Applying writes one budget per line through the existing budgets endpoint,
 * so the plan becomes the thing the Budgets tab already tracks against rather
 * than a second, parallel notion of a limit.
 */
export function SpendingPlan({ onApplied }: { onApplied: () => void }) {
  const { data, error, loading, reload } = useAnalysis()
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(0)

  const f = data?.forecast

  const apply = async () => {
    if (!f) return
    setApplying(true)
    try {
      // Sequential: the budgets endpoint is an upsert per category, and this is
      // at most a dozen small writes.
      for (const line of f.lines) {
        await fetch('/api/selvam/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: line.category, amount: line.amount, month: f.month }),
        })
      }
      setApplied(f.lines.length)
      onApplied()
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div style={card}><p style={{ ...sub, margin: 0 }}>Building next month&apos;s plan…</p></div>
  if (error)   return <div style={{ ...card, borderColor: '#ef444440' }}><p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p></div>
  if (!f) return null

  if (f.lines.length === 0) {
    return (
      <div style={card}>
        <CardHeader Icon={Wand2} title="Plan for next month" note="Needs at least one complete month of history" color="#a78bfa" />
        <Empty text="Import a full month of statements and a plan will appear here." />
      </div>
    )
  }

  const leftover = f.expectedIncome - f.total

  return (
    <div style={{ ...card, background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wand2 size={14} color="#a78bfa" />
            <h3 style={{ ...h3, color: '#a78bfa' }}>Plan for {f.month}</h3>
          </div>
          <p style={sub}>
            Median of your last {f.completeMonths.slice(-3).length} complete months
            ({f.completeMonths.slice(-3).join(', ')}). Medians, so a one-off month doesn&apos;t become your budget.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={reload} title="Recalculate" style={{ height: '32px', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button
            onClick={apply}
            disabled={applying}
            style={{ height: '32px', padding: '0 14px', borderRadius: '8px', background: applying ? 'rgba(99,102,241,0.3)' : '#6366f1', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: applying ? 'default' : 'pointer' }}
          >
            {applying ? 'Applying…' : applied > 0 ? `Applied ${applied}` : 'Apply as budgets'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', margin: '4px 0 16px' }}>
        {[
          { label: 'Planned spend', value: fmt(f.total), color: '#ef4444' },
          { label: 'Expected income', value: fmt(f.expectedIncome), color: '#10b981' },
          { label: 'Already committed', value: fmt(f.committed), color: '#f59e0b' },
          { label: 'Left over', value: fmt(leftover), color: leftover >= 0 ? '#10b981' : '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {f.lines.map(l => (
          <div key={l.category} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COLORS[l.category] ?? '#9ca3af', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{l.category}</span>
            <span style={{ fontSize: '10px', color: l.confidence === 'good' ? 'var(--text-muted)' : '#f59e0b' }}>
              {CONFIDENCE_NOTE[l.confidence]}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '72px', textAlign: 'right' }}>{fmt(l.amount)}</span>
          </div>
        ))}
      </div>

      {f.excluded.length > 0 && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '14px 0 0', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          Not budgeted:{' '}
          {f.excluded.map(e => `${e.category} ${fmt(e.amount)}`).join(', ')} — your statement moves salary
          between your own accounts under this category, so counting it as spending would roughly double the plan.
        </p>
      )}
    </div>
  )
}
