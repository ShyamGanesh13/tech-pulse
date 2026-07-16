'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

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
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '15px', marginRight: '8px' }}>{icon}</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            title={`Add to ${title}`}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              width: '26px',
              height: '26px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '16px',
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
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
        background: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          width: '420px',
          maxWidth: '90vw',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1 }}
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
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
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
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: '8px' }}>
        <span style={{ fontSize: '15px' }}>📅</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>Calendar</span>
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
          {(['Day', 'Week', 'Month', 'Year'] as CalView[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '2px 8px', fontSize: '10px', fontWeight: view === v ? 600 : 400,
              background: view === v ? 'var(--accent-bg)' : 'transparent',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit',
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
                  <button key={day} onClick={() => onSelectDate(cellDate)} style={{ position: 'relative', background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-bg)' : 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-primary)', fontSize: '12px', fontWeight: isToday || isSelected ? 600 : 400, padding: '4px 2px 8px', fontFamily: 'inherit', textAlign: 'center' }}>
                    {day}
                    {hasDot && <span style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? '#fff' : 'var(--accent)', display: 'block' }} />}
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
                  <div key={day.toISOString()} onClick={() => { onSelectDate(day); setViewYear(day.getFullYear()); setViewMonth(day.getMonth()+1) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', padding: '6px 2px', borderRadius: '8px', background: isSelected ? 'var(--accent-bg)' : 'transparent' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,1)}</span>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: isToday || isSelected ? 700 : 400, color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{day.getDate()}</span>
                    </div>
                    {hasDot ? <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', display: 'block' }} /> : <span style={{ width: '4px', height: '4px', display: 'block' }} />}
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
                    <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 10px', background: 'var(--bg)', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', minWidth: '36px', flexShrink: 0, paddingTop: '1px' }}>{formatTime(r.remind_at)}</div>
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
                  <div key={m} onClick={() => { setViewMonth(m); setView('Month') }} style={{ cursor: 'pointer', borderRadius: '8px', padding: '6px', border: `1px solid ${isSelMonth ? 'var(--accent)' : 'var(--border)'}`, background: isCurMonth ? 'var(--accent-bg)' : 'transparent' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: isCurMonth ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'center', marginBottom: '4px' }}>
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
      const res = await fetch(`/api/todos?date=${dateStr}`)
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
    await fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: todo.done ? 0 : 1 }),
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
                  background: active ? pill.color + '22' : 'transparent',
                  border: `1px solid ${active ? pill.color : 'var(--border)'}`,
                  borderRadius: '20px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: active ? pill.color : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {filteredTodos.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {todos.length === 0 ? 'No tasks for this day — press + to add one.' : 'No tasks match this filter.'}
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
              onMouseEnter={() => setHoveredId(todo.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 10px 8px 12px',
                marginLeft: '-12px', marginRight: '-12px',
                borderBottom: '1px solid var(--border)',
                borderLeft: `3px solid ${PRIORITY_COLORS[todo.priority] ?? '#6b7280'}`,
                background: todo.done ? 'transparent' : `${PRIORITY_COLORS[todo.priority] ?? '#6b7280'}0d`,
                transition: 'background 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={!!todo.done}
                onChange={() => handleToggle(todo)}
                style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)', marginTop: '2px' }}
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
                {todo.due_date && (
                  <span style={{ fontSize: '10px', color: isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : isTomorrow ? '#a78bfa' : 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                    {isOverdue ? '⚠ Overdue · ' : isDueToday ? '· Today · ' : isTomorrow ? '· Tomorrow · ' : '· '}
                    {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: PRIORITY_COLORS[todo.priority] ?? '#6b7280', flexShrink: 0, marginTop: '2px' }}>
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
              disabled={saving || !form.title.trim() || !form.due_date}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '9px 0', fontSize: '13px', fontWeight: 600,
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
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' })
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const dateStr = toDateStr(selectedDate)
  const isToday = dateStr === toDateStr(new Date())

  async function loadNyabagam() {
    try {
      const res = await fetch(`/api/ninaivu?date=${dateStr}`)
      const data = await res.json()
      setNyabagam(data.nyabagam ?? [])
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
    ? "Today's Ninaivu"
    : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <>
      <Card title={cardTitle} icon="🔔" onAdd={openModal}>
        {nyabagam.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No ninaivu for this day.
          </p>
        )}
        {nyabagam.map(r => (
          <div
            key={r.id}
            onMouseEnter={() => setHoveredId(r.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', flexShrink: 0, marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(r.remind_at)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{r.title}</div>
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
        ))}
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
              disabled={saving || !form.title.trim() || !form.date || !form.time}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '9px 0', fontSize: '13px', fontWeight: 600,
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

const FOCUS_SECS = 25 * 60
const BREAK_SECS = 5 * 60
const RADIUS = 48
const CIRC = 2 * Math.PI * RADIUS

function FocusTimerCard() {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECS)
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [todos, setTodos] = useState<Todo[]>([])
  const [focusTodoId, setFocusTodoId] = useState<number | ''>('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/todos').then(r => r.json()).then((data: Todo[]) => {
      setTodos(data.filter((t: Todo) => !t.done))
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
        setTimeLeft(BREAK_SECS)
      } else {
        setMode('focus')
        setTimeLeft(FOCUS_SECS)
      }
    }
  }, [timeLeft, isRunning, mode])

  function switchMode(m: 'focus' | 'break') {
    setIsRunning(false)
    setMode(m)
    setTimeLeft(m === 'focus' ? FOCUS_SECS : BREAK_SECS)
  }

  function reset() {
    setIsRunning(false)
    setTimeLeft(mode === 'focus' ? FOCUS_SECS : BREAK_SECS)
  }

  const total = mode === 'focus' ? FOCUS_SECS : BREAK_SECS
  const offset = CIRC * (1 - timeLeft / total)
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')
  const accent = mode === 'focus' ? 'var(--accent)' : '#22c55e'
  const accentHex = mode === 'focus' ? '#6366f1' : '#22c55e'

  return (
    <Card title="Focus Timer" icon="⏱️">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: '10px', paddingTop: '4px' }}>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {(['focus', 'break'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              background: mode === m ? accent : 'transparent',
              border: `1px solid ${mode === m ? accent : 'var(--border)'}`,
              borderRadius: '20px',
              padding: '3px 14px',
              fontSize: '11px',
              fontWeight: 600,
              color: mode === m ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}>
              {m === 'focus' ? 'Focus' : 'Break'}
            </button>
          ))}
        </div>

        {/* Ring */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="148" height="148" viewBox="0 0 120 120">
            {/* glow filter */}
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* track */}
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="5" />
            {/* progress */}
            <circle
              cx="60" cy="60" r={RADIUS}
              fill="none"
              stroke={accentHex}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter={isRunning ? 'url(#glow)' : undefined}
              style={{ transition: isRunning ? 'stroke-dashoffset 1s linear' : 'none' }}
            />
          </svg>
          {/* time label */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {mins}:{secs}
            </span>
            <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>
              {mode === 'focus' ? 'focus' : 'break'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setIsRunning(r => !r)} style={{
            background: accent,
            border: 'none',
            borderRadius: '8px',
            padding: '7px 28px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'opacity 0.15s',
          }}>
            {isRunning ? 'Pause' : timeLeft === total ? 'Start' : 'Resume'}
          </button>
          <button onClick={reset} style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '13px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Reset
          </button>
        </div>

        {/* Session tomatoes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          {Array.from({ length: Math.max(sessions, 1) + (sessions % 4 === 0 ? 0 : 4 - (sessions % 4)) }, (_, i) => (
            <span key={i} style={{ fontSize: '13px', opacity: i < sessions ? 1 : 0.15, transition: 'opacity 0.3s' }}>🍅</span>
          ))}
          {sessions > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              {sessions} session{sessions !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Todo focus selector */}
        {todos.length > 0 && (
          <div style={{ width: '100%', flexShrink: 0 }}>
            <select
              value={focusTodoId}
              onChange={e => setFocusTodoId(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 8px',
                fontSize: '12px',
                color: focusTodoId ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value="">Focusing on…</option>
              {todos.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function NyabagamPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dotRefresh, setDotRefresh] = useState(0)

  function handleNyabagamAdded() {
    setDotRefresh(n => n + 1)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header row — matches Tech Pulse brand bar */}
      <div style={{
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '36px' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Ninaivu
          </span>
        </div>
      </div>

      {/* 2×2 card grid — fills remaining height */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '16px',
          padding: '20px',
          boxSizing: 'border-box',
        }}
      >
        <CalendarCard selectedDate={selectedDate} onSelectDate={setSelectedDate} dotRefresh={dotRefresh} />
        <TodoCard selectedDate={selectedDate} refreshSignal={dotRefresh} onAdded={handleNyabagamAdded} />
        <NyabagamCard selectedDate={selectedDate} refreshSignal={dotRefresh} onAdded={handleNyabagamAdded} />
        <FocusTimerCard />
      </div>
    </div>
  )
}
