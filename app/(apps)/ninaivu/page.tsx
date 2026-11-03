'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Minus, Plus } from 'lucide-react'

// Scoped Thunai polish for Ninaivu: violet signature, hover lift, glass focus
// rings, and the ambient focus-ring glow — all gated for reduced-motion.
const NINAIVU_CSS = `
.ninaivu-root button { font-family: inherit; }
.ninaivu-root ::selection { background: color-mix(in srgb, var(--app-ninaivu) 28%, transparent); }
.nv-tabs { overflow-x: auto; scrollbar-width: none; }
.nv-tabs::-webkit-scrollbar { display: none; }
.nv-tab { transition: background .2s, color .2s, border-color .2s; }
.nv-tab:hover:not(.nv-on) { color: var(--text-1) !important; background: var(--nvh-soft) !important; }
.nv-add { transition: background .2s, color .2s, border-color .2s, transform .2s; }
.nv-add:hover { background: var(--nvh-soft); color: var(--nvh); border-color: color-mix(in srgb, var(--app-ninaivu) 45%, transparent); transform: translateY(-1px); }
.ninaivu-root input:focus, .ninaivu-root select:focus, .ninaivu-root textarea:focus {
  border-color: var(--nvh) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-ninaivu) 20%, transparent);
}
.ninaivu-root button:focus-visible { outline: 2px solid var(--nvh); outline-offset: 2px; }
.nv-row { transition: transform .28s cubic-bezier(.2,.7,.2,1), box-shadow .28s, border-color .2s, background .2s; }
.nv-row:hover { transform: translateY(-1px); box-shadow: var(--sh-2); border-color: color-mix(in srgb, var(--app-ninaivu) 30%, var(--border)); }
.nv-cell { transition: background .18s, transform .18s; }
.nv-cell:hover { background: var(--nvh-soft); }
.nv-step { transition: border-color .18s, color .18s, background .18s; }
.nv-step:hover:not(:disabled) { border-color: var(--nvh); color: var(--nvh); background: var(--nvh-soft); }
.nv-btn { transition: filter .18s, box-shadow .2s, transform .18s, border-color .2s, background .2s; }
.nv-btn-primary:hover { filter: brightness(1.07); box-shadow: 0 8px 22px -10px color-mix(in srgb, var(--app-ninaivu) 85%, transparent); transform: translateY(-1px); }
.nv-btn-ghost:hover { border-color: var(--nvh); color: var(--nvh); background: var(--nvh-soft); }
@keyframes nv-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
.nv-ring-glow { opacity: .5; transition: opacity .4s, background .4s; }
.nv-ring-glow.run { animation: nv-pulse 2.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .nv-row, .nv-cell, .nv-add, .nv-btn, .nv-tab { transition: none; }
  .nv-ring-glow.run { animation: none; }
}
`

// ── Types ──────────────────────────────────────────────────────────────────

interface Todo {
  id: number
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  done: number
  due_date: string | null
  created_at: string
}

interface Nyabagam {
  id: number
  title: string
  description: string | null
  remind_at: string
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(isoStr: string): string {
  return isoStr.slice(11, 16)
}

/** Local-clock `YYYY-MM-DDTHH:MM:SS` — never UTC, dates are compared per local day. */
function localNow(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${toDateStr(d)}T${hh}:${mm}:${ss}`
}

/** `29 Jul` */
function formatDay(dateStr: string): string {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

// ── Card shell ─────────────────────────────────────────────────────────────

function Card({
  title,
  icon,
  onAdd,
  children,
}: {
  title: string
  icon: string
  onAdd?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--sh-2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderBottom: '1px solid var(--hair)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            background: 'var(--nvh-soft)',
            border: '1px solid color-mix(in srgb, var(--app-ninaivu) 28%, transparent)',
            boxShadow: 'var(--tile-glow) var(--app-ninaivu)',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span className="font-display" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)', flex: 1 }}>
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="nv-add"
            title={`Add to ${title}`}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              color: 'var(--text-2)',
              fontSize: '17px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            +
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--bg) 55%, rgba(0,0,0,0.55))',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--glass-2)',
          backdropFilter: 'blur(var(--blur))',
          WebkitBackdropFilter: 'blur(var(--blur))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--sh-3)',
          width: '420px',
          maxWidth: '100%',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <span className="font-display" style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)', flex: 1 }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '18px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-1)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color .18s, box-shadow .18s',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
  marginBottom: '6px',
}

// ── Calendar Card ──────────────────────────────────────────────────────────

type CalView = 'Day' | 'Week' | 'Month' | 'Year'

function getWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

const NB: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '0 5px', lineHeight: '1', flexShrink: 0 }

function CalendarCard({
  selectedDate,
  onSelectDate,
  dotRefresh,
}: {
  selectedDate: Date
  onSelectDate: (d: Date) => void
  dotRefresh: number
}) {
  const today = new Date()
  const [view, setView] = useState<CalView>('Month')
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [dotDays, setDotDays] = useState<Set<number>>(new Set())
  const [dayNyabagam, setDayNyabagam] = useState<Nyabagam[]>([])
  const [weekStart, setWeekStart] = useState(() => getWeekMonday(today))

  const fetchDots = useCallback(async (year: number, month: number) => {
    try {
      const res = await fetch(`/api/ninaivu/dots?year=${year}&month=${month}`)
      const data = await res.json()
      setDotDays(new Set(data.days ?? []))
    } catch { setDotDays(new Set()) }
  }, [])

  useEffect(() => { fetchDots(viewYear, viewMonth) }, [viewYear, viewMonth, fetchDots, dotRefresh])

  useEffect(() => {
    if (view !== 'Day') return
    fetch(`/api/ninaivu?date=${toDateStr(selectedDate)}`)
      .then(r => r.json()).then(d => setDayNyabagam(d.nyabagam ?? []))
      .catch(() => setDayNyabagam([]))
  }, [view, selectedDate, dotRefresh])

  // Month view data
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const numWeeks = Math.ceil(cells.length / 7)
  const mLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prevMonth() { if (viewMonth === 1) { setViewYear(y => y-1); setViewMonth(12) } else setViewMonth(m => m-1) }
  function nextMonth() { if (viewMonth === 12) { setViewYear(y => y+1); setViewMonth(1) } else setViewMonth(m => m+1) }

  // Week view data
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000))
  const wLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--sh-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flex: 1 }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--hair)', flexShrink: 0, gap: '10px' }}>
        <span style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', background: 'var(--nvh-soft)', border: '1px solid color-mix(in srgb, var(--app-ninaivu) 28%, transparent)', boxShadow: 'var(--tile-glow) var(--app-ninaivu)', flexShrink: 0 }}>📅</span>
        <span className="font-display" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)', flex: 1 }}>Calendar</span>
        <div style={{ display: 'flex', background: 'var(--surface-1)', borderRadius: '999px', padding: '3px', border: '1px solid var(--border)' }}>
          {(['Day', 'Week', 'Month', 'Year'] as CalView[]).map(v => (
            <button key={v} className={view === v ? 'nv-tab nv-on' : 'nv-tab'} onClick={() => setView(v)} style={{
              padding: '3px 10px', fontSize: '10px', fontWeight: view === v ? 700 : 500,
              background: view === v ? 'var(--nvh)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-3)',
              border: 'none', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit',
            }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── Month view ── */}
        {view === 'Month' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={prevMonth} style={NB}>‹</button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{mLabel}</span>
              <button onClick={nextMonth} style={NB}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px', flexShrink: 0 }}>
              {DAYS_OF_WEEK.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', paddingBottom: '4px' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridTemplateRows: `repeat(${numWeeks},1fr)`, gap: '2px', flex: 1 }}>
              {cells.map((day, idx) => {
                if (day === null) return <div key={`b-${idx}`} />
                const isToday = day === today.getDate() && viewMonth === today.getMonth()+1 && viewYear === today.getFullYear()
                const cellDate = new Date(viewYear, viewMonth-1, day)
                const isSelected = toDateStr(cellDate) === toDateStr(selectedDate)
                const hasDot = dotDays.has(day)
                return (
                  <button key={day} className="nv-cell" onClick={() => onSelectDate(cellDate)} style={{ position: 'relative', background: isSelected ? 'color-mix(in srgb, var(--app-ninaivu) 9%, transparent)' : undefined, border: '1px solid transparent', borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '6px 2px', fontFamily: 'inherit' }}>
                    <span style={{ width: '26px', height: '26px', display: 'grid', placeItems: 'center', borderRadius: '50%', fontSize: '12px', fontWeight: isToday || isSelected ? 700 : 400, background: isSelected ? 'var(--nvh)' : 'transparent', border: `1.5px solid ${isToday && !isSelected ? 'var(--nvh)' : 'transparent'}`, color: isSelected ? '#fff' : isToday ? 'var(--nvh)' : 'var(--text-1)', boxShadow: isSelected ? 'var(--tile-glow) var(--app-ninaivu)' : undefined }}>{day}</span>
                    {hasDot && <span style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--nvh)', display: 'block' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Week view ── */}
        {view === 'Week' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={() => setWeekStart(w => new Date(w.getTime() - 7*86400000))} style={NB}>‹</button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{wLabel}</span>
              <button onClick={() => setWeekStart(w => new Date(w.getTime() + 7*86400000))} style={NB}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', flex: 1 }}>
              {weekDays.map(day => {
                const isToday = toDateStr(day) === toDateStr(today)
                const isSelected = toDateStr(day) === toDateStr(selectedDate)
                const sameMonth = day.getMonth()+1 === viewMonth && day.getFullYear() === viewYear
                const hasDot = sameMonth && dotDays.has(day.getDate())
                return (
                  <div key={day.toISOString()} onClick={() => { onSelectDate(day); setViewYear(day.getFullYear()); setViewMonth(day.getMonth()+1) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', padding: '6px 2px', borderRadius: '8px', background: isSelected ? 'var(--nvh-soft)' : 'transparent' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,1)}</span>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isSelected ? 'var(--nvh)' : isToday ? 'var(--nvh-soft)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: isToday || isSelected ? 700 : 400, color: isSelected ? '#fff' : isToday ? 'var(--nvh)' : 'var(--text-primary)' }}>{day.getDate()}</span>
                    </div>
                    {hasDot ? <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--nvh)', display: 'block' }} /> : <span style={{ width: '4px', height: '4px', display: 'block' }} />}
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{day.toLocaleDateString('en-US', { month: 'short' })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Day view ── */}
        {view === 'Day' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
              <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()-1); onSelectDate(d) }} style={NB}>‹</button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()+1); onSelectDate(d) }} style={NB}>›</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {dayNyabagam.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', gap: '6px' }}>
                  <span style={{ fontSize: '22px' }}>🗓</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No events this day</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dayNyabagam.map(r => (
                    <div key={r.id} className="nv-row" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderLeft: '3px solid var(--nvh)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--nvh)', minWidth: '36px', flexShrink: 0, paddingTop: '1px', fontVariantNumeric: 'tabular-nums' }}>{formatTime(r.remind_at)}</div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</div>
                        {r.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Year view ── */}
        {view === 'Year' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
              <button onClick={() => setViewYear(y => y-1)} style={NB}>‹</button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{viewYear}</span>
              <button onClick={() => setViewYear(y => y+1)} style={NB}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', flex: 1, overflowY: 'auto' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const isCurMonth = m === today.getMonth()+1 && viewYear === today.getFullYear()
                const isSelMonth = m === selectedDate.getMonth()+1 && viewYear === selectedDate.getFullYear()
                const fd = getFirstDayOfMonth(viewYear, m)
                const dim = getDaysInMonth(viewYear, m)
                const mc: (number|null)[] = [...Array(fd).fill(null), ...Array.from({length:dim},(_,i)=>i+1)]
                return (
                  <div key={m} onClick={() => { setViewMonth(m); setView('Month') }} style={{ cursor: 'pointer', borderRadius: '8px', padding: '6px', border: `1px solid ${isSelMonth ? 'var(--nvh)' : 'var(--border)'}`, background: isCurMonth ? 'var(--nvh-soft)' : 'transparent' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: isCurMonth ? 'var(--nvh)' : 'var(--text-secondary)', textAlign: 'center', marginBottom: '4px' }}>
                      {new Date(viewYear, m-1).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px' }}>
                      {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} style={{ textAlign: 'center', fontSize: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>{d}</div>)}
                      {mc.slice(0, 35).map((day, idx) => (
                        <div key={idx} style={{ textAlign: 'center', fontSize: '6px', color: day ? 'var(--text-muted)' : 'transparent', padding: '1px 0', fontWeight: day === today.getDate() && isCurMonth ? 700 : 400 }}>{day ?? '·'}</div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Todo Card ──────────────────────────────────────────────────────────────

const PRIORITY_PILLS: { label: string; value: string; color: string }[] = [
  { label: 'All',    value: 'all',    color: 'rgba(156,163,175,0.7)' },
  { label: 'High',   value: 'high',   color: '#ef4444' },
  { label: 'Medium', value: 'medium', color: '#f59e0b' },
  { label: 'Low',    value: 'low',    color: '#22c55e' },
]

function TodoCard({
  selectedDate,
  refreshSignal,
  onAdded,
}: {
  selectedDate: Date
  refreshSignal: number
  onAdded: () => void
}) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: toDateStr(new Date()) })
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [filterPriority, setFilterPriority] = useState('all')

  const dateStr = toDateStr(selectedDate)
  const isToday = dateStr === toDateStr(new Date())

  async function loadTodos() {
    try {
      // Today shows the rolling agenda (every open task until it's ticked off);
      // picking any other day browses just that day's due tasks.
      const scope = isToday ? '&scope=agenda' : ''
      const res = await fetch(`/api/todos?date=${dateStr}${scope}`)
      const data = await res.json()
      setTodos(data.todos ?? [])
    } catch { /* silent */ }
  }

  useEffect(() => { loadTodos() }, [dateStr, refreshSignal])

  function openModal() {
    setForm({ title: '', description: '', priority: 'medium', due_date: dateStr })
    setShowModal(true)
  }

  async function handleAdd() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, due_date: form.due_date || null }),
      })
      setShowModal(false)
      await loadTodos()
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(todo: Todo) {
    const done = todo.done ? 0 : 1
    await fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Send our local timestamp — the agenda filters completions by the
      // browser's local date, which a UTC server clock can be a day off from.
      body: JSON.stringify({ done, completed_at: done ? localNow() : null }),
    })
    await loadTodos()
  }

  async function handleDelete(id: number) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    await loadTodos()
    onAdded()
  }

  const filteredTodos = filterPriority === 'all' ? todos : todos.filter(t => t.priority === filterPriority)
  const cardTitle = isToday ? 'To-Dos' : `To-Dos · ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <>
      <Card title={cardTitle} icon="✅" onAdd={openModal}>
        {/* Priority filter pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {PRIORITY_PILLS.map(pill => {
            const active = filterPriority === pill.value
            return (
              <button
                key={pill.value}
                onClick={() => setFilterPriority(pill.value)}
                style={{
                  // color-mix keeps a valid translucent fill even when pill.color
                  // is an rgba() (the old `pill.color + '22'` produced `rgba(...)22`,
                  // invalid CSS, so the active "All" pill rendered with no fill).
                  background: active ? `color-mix(in srgb, ${pill.color} 16%, transparent)` : 'transparent',
                  border: `1px solid ${active ? pill.color : 'var(--border)'}`,
                  borderRadius: '999px',
                  padding: '3px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: active ? pill.color : 'var(--text-3)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.18s',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {filteredTodos.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {todos.length > 0
              ? 'No tasks match this filter.'
              : isToday
                ? 'Nothing open — press + to add a task.'
                : 'No tasks due this day — press + to add one.'}
          </p>
        )}
        {filteredTodos.map(todo => {
          const today = toDateStr(new Date())
          const isOverdue = todo.due_date && todo.due_date < today && !todo.done
          const isTomorrow = todo.due_date && todo.due_date === toDateStr(new Date(Date.now() + 86400000))
          const isDueToday = todo.due_date && todo.due_date === today
          return (
            <div
              key={todo.id}
              className="nv-row"
              onMouseEnter={() => setHoveredId(todo.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '10px 12px',
                marginBottom: '8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${PRIORITY_COLORS[todo.priority] ?? '#6b7280'}`,
                background: todo.done ? 'var(--surface-1)' : `color-mix(in srgb, ${PRIORITY_COLORS[todo.priority] ?? '#6b7280'} 8%, var(--surface-2))`,
              }}
            >
              <input
                type="checkbox"
                checked={!!todo.done}
                onChange={() => handleToggle(todo)}
                style={{ cursor: 'pointer', flexShrink: 0, accentColor: PRIORITY_COLORS[todo.priority] ?? 'var(--nvh)', width: '15px', height: '15px', marginTop: '2px' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '13px',
                    color: todo.done ? 'var(--text-muted)' : (PRIORITY_COLORS[todo.priority] ?? 'var(--text-primary)'),
                    display: 'block',
                    textDecoration: todo.done ? 'line-through' : 'none',
                    opacity: todo.done ? 0.5 : 1,
                    fontWeight: todo.priority === 'high' && !todo.done ? 500 : 400,
                  }}
                >
                  {todo.title}
                </span>
                {todo.due_date && (() => {
                  const dueColor = isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : isTomorrow ? 'var(--nvh)' : 'var(--text-3)'
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '5px', fontSize: '10px', fontWeight: 600, color: dueColor, background: `color-mix(in srgb, ${dueColor} 13%, transparent)`, borderRadius: '999px', padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>
                      {isOverdue ? '⚠ Overdue · ' : isDueToday ? '· Today · ' : isTomorrow ? '· Tomorrow · ' : '· '}
                      {formatDay(todo.due_date)}
                    </span>
                  )
                })()}
              </div>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: PRIORITY_COLORS[todo.priority] ?? '#6b7280', background: `color-mix(in srgb, ${PRIORITY_COLORS[todo.priority] ?? '#6b7280'} 15%, transparent)`, borderRadius: '999px', padding: '2px 8px', flexShrink: 0, marginTop: '2px' }}>
                {todo.priority}
              </span>
              {hoveredId === todo.id && (
                <button
                  onClick={() => handleDelete(todo.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1, flexShrink: 0, padding: 0 }}
                  title="Delete"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </Card>

      {showModal && (
        <Modal title="Add To-Do" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                style={inputStyle}
                placeholder="Task title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                placeholder="Optional details"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select
                style={inputStyle}
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input
                type="date"
                style={inputStyle}
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <button
              onClick={handleAdd}
              className="nv-btn nv-btn-primary"
              disabled={saving || !form.title.trim() || !form.due_date}
              style={{
                background: 'var(--nvh)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--sh-1)',
                padding: '11px 0', fontSize: '13px', fontWeight: 600,
                cursor: saving || !form.title.trim() || !form.due_date ? 'not-allowed' : 'pointer',
                opacity: saving || !form.title.trim() || !form.due_date ? 0.6 : 1,
                fontFamily: 'inherit', width: '100%',
              }}
            >
              {saving ? 'Adding…' : 'Add To-Do'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Nyabagam Card ─────────────────────────────────────────────────────────

function NyabagamCard({
  selectedDate,
  refreshSignal,
  onAdded,
}: {
  selectedDate: Date
  refreshSignal: number
  onAdded: () => void
}) {
  const [nyabagam, setNyabagam] = useState<Nyabagam[]>([])
  const [upcoming, setUpcoming] = useState<Nyabagam[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' })
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const dateStr = toDateStr(selectedDate)
  const isToday = dateStr === toDateStr(new Date())

  async function loadNyabagam() {
    try {
      // Today's card also surfaces what's coming in the next fortnight, so a
      // reminder set for tomorrow isn't invisible until tomorrow.
      const res = await fetch(`/api/ninaivu?date=${dateStr}${isToday ? '&upcoming=14' : ''}`)
      const data = await res.json()
      setNyabagam(data.nyabagam ?? [])
      setUpcoming(data.upcoming ?? [])
    } catch { /* silent */ }
  }

  useEffect(() => { loadNyabagam() }, [dateStr, refreshSignal])

  function openModal() {
    setForm({ title: '', description: '', date: toDateStr(new Date()), time: '09:00' })
    setShowModal(true)
  }

  async function handleAdd() {
    if (!form.title.trim() || !form.date || !form.time) return
    setSaving(true)
    try {
      const remind_at = `${form.date}T${form.time}:00`
      await fetch('/api/ninaivu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description || null, remind_at }),
      })
      setShowModal(false)
      await loadNyabagam()
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/ninaivu/${id}`, { method: 'DELETE' })
    await loadNyabagam()
    onAdded()
  }

  const cardTitle = isToday
    ? "Today's Reminders"
    : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  function row(r: Nyabagam, withDay: boolean) {
    return (
      <div
        key={r.id}
        className="nv-row"
        onMouseEnter={() => setHoveredId(r.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', marginBottom: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', borderLeft: `3px solid ${withDay ? 'var(--border)' : 'var(--nvh)'}`, background: withDay ? 'transparent' : 'var(--surface-1)' }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: withDay ? 'var(--text-3)' : 'var(--nvh)', flexShrink: 0, marginTop: '1px', fontVariantNumeric: 'tabular-nums', minWidth: withDay ? '84px' : undefined }}>
          {withDay ? `${formatDay(r.remind_at)} ${formatTime(r.remind_at)}` : formatTime(r.remind_at)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: withDay ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: 500 }}>{r.title}</div>
          {r.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.description}
            </div>
          )}
        </div>
        {hoveredId === r.id && (
          <button
            onClick={() => handleDelete(r.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1, flexShrink: 0, padding: 0 }}
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <Card title={cardTitle} icon="🔔" onAdd={openModal}>
        {nyabagam.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No ninaivu for this day.
          </p>
        )}
        {nyabagam.map(r => row(r, false))}

        {upcoming.length > 0 && (
          <>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '16px 0 4px' }}>
              Upcoming
            </div>
            {upcoming.map(r => row(r, true))}
          </>
        )}
      </Card>

      {showModal && (
        <Modal title="Add Ninaivu" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                style={inputStyle}
                placeholder="Ninaivu title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                placeholder="Optional details"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Time *</label>
                <input
                  type="time"
                  style={inputStyle}
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              className="nv-btn nv-btn-primary"
              disabled={saving || !form.title.trim() || !form.date || !form.time}
              style={{
                background: 'var(--nvh)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--sh-1)',
                padding: '11px 0', fontSize: '13px', fontWeight: 600,
                cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !form.title.trim() ? 0.6 : 1,
                fontFamily: 'inherit', width: '100%',
              }}
            >
              {saving ? 'Adding…' : 'Add Ninaivu'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Focus Timer Card ───────────────────────────────────────────────────────

const DEFAULT_MINS = { focus: 25, break: 5 }
const STEP_MIN = 5
// Floors and ceilings so the stepper cannot produce a pointless timer: a
// zero-minute focus, or a break longer than the work it interrupts.
const LIMITS: Record<'focus' | 'break', [number, number]> = { focus: [5, 120], break: [5, 30] }
const TIMER_KEY = 'ninaivu.timer-mins'
const RADIUS = 48
const CIRC = 2 * Math.PI * RADIUS

function StepButton({ dir, disabled, limit, onClick }: {
  dir: 'up' | 'down'
  disabled: boolean
  limit: number
  onClick: () => void
}) {
  const Icon = dir === 'up' ? Plus : Minus
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="nv-step"
      title={disabled
        ? `${dir === 'up' ? 'Maximum' : 'Minimum'} is ${limit} min`
        : `${dir === 'up' ? 'Lengthen' : 'Shorten'} by ${STEP_MIN} min`}
      style={{
        width: '26px', height: '26px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: '1px solid var(--border)',
        color: disabled ? 'var(--border)' : 'var(--text-2)',
        cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
      }}
    >
      <Icon size={13} />
    </button>
  )
}

function FocusTimerCard() {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [durations, setDurations] = useState(DEFAULT_MINS)
  const [timeLeft, setTimeLeft] = useState(DEFAULT_MINS.focus * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [todos, setTodos] = useState<Todo[]>([])
  const [focusTodoId, setFocusTodoId] = useState<number | ''>('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null')
      if (saved && typeof saved.focus === 'number' && typeof saved.break === 'number') {
        // Clamped on the way in: the stored value outlives the limits, and the
        // break floor moved from 1 to 5 so the steps stay multiples of five.
        const clamp = (v: number, m: 'focus' | 'break') =>
          Math.min(LIMITS[m][1], Math.max(LIMITS[m][0], v))
        const mins = { focus: clamp(saved.focus, 'focus'), break: clamp(saved.break, 'break') }
        setDurations(mins)
        setTimeLeft(mins.focus * 60)
      }
    } catch { /* a corrupt entry just means the defaults */ }
  }, [])

  useEffect(() => {
    fetch('/api/todos').then(r => r.json()).then((data: { todos?: Todo[] }) => {
      setTodos((data.todos ?? []).filter(t => !t.done))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1))
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning])

  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      setIsRunning(false)
      if (mode === 'focus') {
        setSessions(s => s + 1)
        setMode('break')
        setTimeLeft(durations.break * 60)
      } else {
        setMode('focus')
        setTimeLeft(durations.focus * 60)
      }
    }
  }, [timeLeft, isRunning, mode, durations])

  function switchMode(m: 'focus' | 'break') {
    setIsRunning(false)
    setMode(m)
    setTimeLeft(durations[m] * 60)
  }

  function reset() {
    setIsRunning(false)
    setTimeLeft(durations[mode] * 60)
  }

  /**
   * Lengthens or shortens the current mode.
   *
   * Running, "+" adds time to the session in progress rather than restarting
   * it — the reason to reach for it mid-timer is wanting five more minutes.
   * Stopped, it just sets the new length.
   */
  function adjust(delta: number) {
    const [lo, hi] = LIMITS[mode]
    const next = Math.min(hi, Math.max(lo, durations[mode] + delta))
    if (next === durations[mode]) return
    const updated = { ...durations, [mode]: next }
    setDurations(updated)
    try { localStorage.setItem(TIMER_KEY, JSON.stringify(updated)) } catch { /* private mode */ }
    setTimeLeft(t => isRunning ? Math.max(1, t + delta * 60) : next * 60)
  }

  const atFloor = durations[mode] <= LIMITS[mode][0]
  const atCeil  = durations[mode] >= LIMITS[mode][1]

  const total = durations[mode] * 60
  const offset = CIRC * (1 - timeLeft / total)
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')
  // Mode-signifying ring/chrome colour: focus follows the app's violet
  // signature, break stays green. Kept as explicit mode data, not a chrome token.
  const accent = mode === 'focus' ? 'var(--nvh)' : '#22c55e'

  // On a break you're deliberately not on the task, so the ring falls back to the mode.
  const focusTodo = todos.find(t => t.id === focusTodoId)
  const ringLabel = mode === 'focus' && focusTodo ? focusTodo.title : mode

  return (
    <Card title="Focus Timer" icon="⏱️">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: '10px', paddingTop: '4px' }}>

        {/* What you're working on — the first decision, before the timer */}
        <div style={{ width: '100%', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Focusing on
          </div>
          {todos.length > 0 ? (
            <select
              value={focusTodoId}
              onChange={e => setFocusTodoId(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: `1px solid ${focusTodoId ? accent : 'var(--border)'}`,
                borderRadius: '6px',
                padding: '5px 8px',
                fontSize: '12px',
                color: focusTodoId ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <option value="">Pick a task…</option>
              {todos.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '5px 0' }}>
              No open tasks — add one in To-Dos.
            </p>
          )}
        </div>

        {/* Mode tabs and the length stepper share a row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '6px' }}>
          {(['focus', 'break'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              background: mode === m ? accent : 'transparent',
              border: `1px solid ${mode === m ? accent : 'var(--border)'}`,
              borderRadius: '999px',
              padding: '4px 16px',
              fontSize: '11px',
              fontWeight: 700,
              color: mode === m ? '#fff' : 'var(--text-3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              boxShadow: mode === m ? `var(--tile-glow) ${accent}` : undefined,
              transition: 'all 0.18s',
            }}>
              {m === 'focus' ? 'Focus' : 'Break'}
            </button>
          ))}
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--hair)', flexShrink: 0 }} />

          <StepButton dir="down" disabled={atFloor} limit={LIMITS[mode][0]} onClick={() => adjust(-STEP_MIN)} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '48px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {durations[mode]} min
          </span>
          <StepButton dir="up" disabled={atCeil} limit={LIMITS[mode][1]} onClick={() => adjust(STEP_MIN)} />
        </div>

        {/* Ring — takes the slack between the mode tabs and the controls, so the
            pane has no dead space, and scales with it rather than sitting at a
            fixed 148px. The viewBox is fixed, so the SVG scales cleanly and only
            the text needs its own clamp. */}
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 'min(100%, 52vh)', maxWidth: '440px', aspectRatio: '1' }}>
          {/* Ambient glow behind the ring — strong on the inky Aurora canvas,
              subtle in Daylight. Pulses only while running, and not at all under
              prefers-reduced-motion. */}
          <div
            aria-hidden
            className={`nv-ring-glow${isRunning ? ' run' : ''}`}
            style={{ position: 'absolute', inset: '14%', borderRadius: '50%', background: `radial-gradient(circle, ${accent} 0%, transparent 68%)`, filter: 'blur(28px)', zIndex: -1, pointerEvents: 'none' }}
          />
          <svg width="100%" height="100%" viewBox="0 0 120 120">
            {/* glow filter */}
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* track */}
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--hair)" strokeWidth="7" />
            {/* progress */}
            <circle
              cx="60" cy="60" r={RADIUS}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter={isRunning ? 'url(#glow)' : undefined}
              style={{ stroke: accent, transition: isRunning ? 'stroke-dashoffset 1s linear' : 'none' }}
            />
          </svg>
          {/* time label */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 'clamp(30px, 11vh, 76px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {mins}:{secs}
            </span>
            <span
              title={ringLabel}
              style={{
                fontSize: 'clamp(9px, 1.8vh, 15px)',
                color: 'var(--text-muted)',
                marginTop: '6px',
                maxWidth: '62%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                // A task title in tracked-out caps is unreadable at 9px; only the
                // mode word gets that treatment.
                ...(focusTodo && mode === 'focus'
                  ? {}
                  : { letterSpacing: '0.1em', textTransform: 'uppercase' as const }),
              }}
            >
              {ringLabel}
            </span>
          </div>
        </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setIsRunning(r => !r)} className="nv-btn nv-btn-primary" style={{
            background: accent,
            border: 'none',
            borderRadius: '999px',
            padding: '9px 32px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: `var(--tile-glow) ${accent}`,
          }}>
            {isRunning ? 'Pause' : timeLeft === total ? 'Start' : 'Resume'}
          </button>
          <button onClick={reset} className="nv-btn nv-btn-ghost" style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Reset
          </button>
        </div>

        {/* Session tomatoes — padded out to a whole set of four, none at zero
            (Math.max(sessions, 1) used to leave one ghost tomato floating) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, minHeight: '18px' }}>
          {sessions === 0 ? (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No sessions yet</span>
          ) : (
            <>
              {Array.from({ length: Math.ceil(sessions / 4) * 4 }, (_, i) => (
                <span key={i} style={{ fontSize: '13px', opacity: i < sessions ? 1 : 0.15, transition: 'opacity 0.3s' }}>🍅</span>
              ))}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                {sessions} session{sessions !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>

      </div>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

type Tab = 'Calendar' | 'To-Dos' | 'Reminders' | 'Focus Timer'
const TABS: Tab[] = ['Calendar', 'To-Dos', 'Reminders', 'Focus Timer']

export default function NyabagamPage() {
  const [tab, setTab] = useState<Tab>('Calendar')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dotRefresh, setDotRefresh] = useState(0)

  function handleNyabagamAdded() {
    setDotRefresh(n => n + 1)
  }

  return (
    <div
      className="ninaivu-root"
      style={{
        ['--nvh' as string]: 'var(--app-ninaivu)',
        ['--nvh-soft' as string]: 'color-mix(in srgb, var(--app-ninaivu) 14%, transparent)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(120% 90% at 100% -10%, color-mix(in srgb, var(--app-ninaivu) 10%, transparent) 0%, transparent 55%), var(--bg)',
      } as React.CSSProperties}
    >
      <style>{NINAIVU_CSS}</style>

      {/* Header and tab bar */}
      <div style={{ background: 'var(--glass)', backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))', borderBottom: '1px solid var(--hair)', padding: '0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', height: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--app-ninaivu)', boxShadow: 'var(--tile-glow) var(--app-ninaivu)', flexShrink: 0 }} />
          <span className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Ninaivu</span>
        </div>
        <div className="nv-tabs" style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {TABS.map(t => (
            <button key={t} className={tab === t ? 'nv-tab nv-on' : 'nv-tab'} onClick={() => setTab(t)} style={{ padding: '5px 13px', whiteSpace: 'nowrap', background: tab === t ? 'var(--nvh-soft)' : 'transparent', color: tab === t ? 'var(--nvh)' : 'var(--text-3)', border: `1px solid ${tab === t ? 'color-mix(in srgb, var(--app-ninaivu) 35%, transparent)' : 'transparent'}`, borderRadius: '999px', fontSize: '12px', fontWeight: tab === t ? 600 : 500, cursor: 'pointer' }}>{t}</button>
          ))}
        </div>
      </div>

      {/* One card, filling the pane. selectedDate lives here rather than in the
          calendar, so picking a day and then switching tabs keeps it — the
          To-Dos and Reminders cards already title themselves with that date. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
        {tab === 'Calendar'    && <CalendarCard selectedDate={selectedDate} onSelectDate={setSelectedDate} dotRefresh={dotRefresh} />}
        {tab === 'To-Dos'      && <TodoCard selectedDate={selectedDate} refreshSignal={dotRefresh} onAdded={handleNyabagamAdded} />}
        {tab === 'Reminders'   && <NyabagamCard selectedDate={selectedDate} refreshSignal={dotRefresh} onAdded={handleNyabagamAdded} />}
        {tab === 'Focus Timer' && <FocusTimerCard />}
      </div>
    </div>
  )
}
