'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Todo {
  id: number
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  done: number
  created_at: string
}

interface Reminder {
  id: number
  title: string
  description: string | null
  remind_at: string
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
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
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [dotDays, setDotDays] = useState<Set<number>>(new Set())

  const fetchDots = useCallback(async (year: number, month: number) => {
    try {
      const res = await fetch(`/api/reminders/dots?year=${year}&month=${month}`)
      const data = await res.json()
      setDotDays(new Set(data.days ?? []))
    } catch {
      setDotDays(new Set())
    }
  }, [])

  useEffect(() => {
    fetchDots(viewYear, viewMonth)
  }, [viewYear, viewMonth, fetchDots, dotRefresh])

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <Card title="Calendar" icon="📅">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <button
          onClick={prevMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '0 6px' }}
        >
          ‹
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {monthLabel}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '0 6px' }}
        >
          ›
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {DAYS_OF_WEEK.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', paddingBottom: '4px' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map((day, idx) => {
          if (day === null) return <div key={`blank-${idx}`} />
          const isToday =
            day === today.getDate() &&
            viewMonth === today.getMonth() + 1 &&
            viewYear === today.getFullYear()
          const cellDate = new Date(viewYear, viewMonth - 1, day)
          const isSelected = toDateStr(cellDate) === toDateStr(selectedDate)
          const hasDot = dotDays.has(day)
          return (
            <button
              key={day}
              onClick={() => onSelectDate(cellDate)}
              style={{
                position: 'relative',
                background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-bg)' : 'none',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: isToday || isSelected ? 600 : 400,
                padding: '4px 2px 8px',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              {day}
              {hasDot && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: isSelected ? '#fff' : 'var(--accent)',
                    display: 'block',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ── Todo Card ──────────────────────────────────────────────────────────────

function TodoCard() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' })
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  async function loadTodos() {
    try {
      const res = await fetch('/api/todos')
      const data = await res.json()
      setTodos(data.todos ?? [])
    } catch { /* silent */ }
  }

  useEffect(() => { loadTodos() }, [])

  async function handleAdd() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm({ title: '', description: '', priority: 'medium' })
      setShowModal(false)
      await loadTodos()
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
  }

  return (
    <>
      <Card title="To-Dos" icon="✅" onAdd={() => setShowModal(true)}>
        {todos.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No tasks yet — press + to add one.
          </p>
        )}
        {todos.map(todo => (
          <div
            key={todo.id}
            onMouseEnter={() => setHoveredId(todo.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}
          >
            <input
              type="checkbox"
              checked={!!todo.done}
              onChange={() => handleToggle(todo)}
              style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }}
            />
            <span
              style={{
                flex: 1, fontSize: '13px', color: 'var(--text-primary)',
                textDecoration: todo.done ? 'line-through' : 'none',
                opacity: todo.done ? 0.5 : 1,
              }}
            >
              {todo.title}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: PRIORITY_COLORS[todo.priority] ?? '#6b7280', flexShrink: 0 }}>
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
        ))}
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
            <button
              onClick={handleAdd}
              disabled={saving || !form.title.trim()}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '9px 0', fontSize: '13px', fontWeight: 600,
                cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !form.title.trim() ? 0.6 : 1,
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

// ── Reminders Card ─────────────────────────────────────────────────────────

function RemindersCard({
  selectedDate,
  refreshSignal,
  onAdded,
}: {
  selectedDate: Date
  refreshSignal: number
  onAdded: () => void
}) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' })
  const [saving, setSaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const dateStr = toDateStr(selectedDate)
  const isToday = dateStr === toDateStr(new Date())

  async function loadReminders() {
    try {
      const res = await fetch(`/api/reminders?date=${dateStr}`)
      const data = await res.json()
      setReminders(data.reminders ?? [])
    } catch { /* silent */ }
  }

  useEffect(() => { loadReminders() }, [dateStr, refreshSignal])

  function openModal() {
    setForm({ title: '', description: '', date: dateStr, time: '09:00' })
    setShowModal(true)
  }

  async function handleAdd() {
    if (!form.title.trim() || !form.date || !form.time) return
    setSaving(true)
    try {
      const remind_at = `${form.date}T${form.time}:00`
      await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description || null, remind_at }),
      })
      setShowModal(false)
      await loadReminders()
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
    await loadReminders()
    onAdded()
  }

  const cardTitle = isToday
    ? "Today's Reminders"
    : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <>
      <Card title={cardTitle} icon="🔔" onAdd={openModal}>
        {reminders.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No reminders for this day.
          </p>
        )}
        {reminders.map(r => (
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
        <Modal title="Add Reminder" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                style={inputStyle}
                placeholder="Reminder title"
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
              {saving ? 'Adding…' : 'Add Reminder'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dotRefresh, setDotRefresh] = useState(0)

  function handleReminderAdded() {
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
            Reminders
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
        <TodoCard />
        <RemindersCard selectedDate={selectedDate} refreshSignal={dotRefresh} onAdded={handleReminderAdded} />
        <Card title="Overview" icon="📊">
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Coming soon.
          </p>
        </Card>
      </div>
    </div>
  )
}
