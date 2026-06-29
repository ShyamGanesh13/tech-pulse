'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface Note {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function preview(content: string): string {
  const text = content.replace(/\n+/g, ' ').trim()
  return text.length > 80 ? text.slice(0, 80) + '…' : text || 'No additional text'
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<{ title: string; content: string } | null>(null)

  const selectedNote = notes.find(n => n.id === selectedId) ?? null

  useEffect(() => {
    fetch('/api/notes')
      .then(r => r.json())
      .then((data: Note[]) => {
        setNotes(data)
        if (data.length > 0) selectNote(data[0])
      })
  }, [])

  function selectNote(note: Note) {
    setSelectedId(note.id)
    setTitle(note.title)
    setContent(note.content)
    lastSaved.current = { title: note.title, content: note.content }
  }

  const saveNote = useCallback(async (id: number, t: string, c: string) => {
    setSaving(true)
    const res = await fetch(`/api/notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t, content: c }),
    })
    const updated: Note = await res.json()
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? updated : n)
      next.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      return next
    })
    lastSaved.current = { title: t, content: c }
    setSaving(false)
  }, [])

  function scheduleSave(t: string, c: string) {
    if (selectedId === null) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(selectedId, t, c), 800)
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    scheduleSave(e.target.value, content)
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value)
    scheduleSave(title, e.target.value)
  }

  async function newNote() {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', content: '' }),
    })
    const created: Note = await res.json()
    setNotes(prev => [created, ...prev])
    selectNote(created)
  }

  async function deleteNote(id: number) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      if (selectedId === id) {
        if (next.length > 0) selectNote(next[0])
        else {
          setSelectedId(null)
          setTitle('')
          setContent('')
          lastSaved.current = null
        }
      }
      return next
    })
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '36px',
      }}>
        <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Notes
        </span>
        <button
          onClick={newNote}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + New Note
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Note list */}
        <div style={{
          width: '260px',
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg)',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder="Search notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                {search ? 'No matches' : 'No notes yet'}
              </div>
            )}
            {filtered.map(note => (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: note.id === selectedId ? 'var(--accent-bg)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3px' }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: note.id === selectedId ? 'var(--accent)' : 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {note.title || 'Untitled'}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>
                    {formatDate(note.updated_at)}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {note.id === selectedId ? preview(content) : preview(note.content)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {selectedNote ? (
            <>
              {/* Editor toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 20px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {saving ? 'Saving…' : `Edited ${formatDate(selectedNote.updated_at)}`}
                </span>
                <button
                  onClick={() => deleteNote(selectedNote.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="Title"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  padding: '20px 24px 8px',
                  letterSpacing: '-0.02em',
                  flexShrink: 0,
                }}
              />

              {/* Content */}
              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder="Start writing…"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  background: 'transparent',
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  padding: '0 24px 24px',
                }}
              />
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}>
              <span style={{ fontSize: '32px' }}>📝</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>No note selected</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Create a new note to get started</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
