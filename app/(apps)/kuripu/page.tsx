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
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// Calendar-day difference, not elapsed 24h periods — so a note touched at
// 11pm and read at 1am correctly reads "Yesterday" rather than a bare time.
function dayDiff(a: Date, b: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(a) - start(b)) / 86400000)
}

// Short stamp that always carries a clock time — used for the created /
// last-modified pair in the editor status bar.
function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const days = dayDiff(now, d)
  if (days === 0) return time
  if (days === 1) return `Yesterday ${time}`
  if (days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return `${d.toLocaleDateString([], opts)}, ${time}`
}

// Unabbreviated timestamp for the hover tooltip.
function formatFull(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleString([], {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ')
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}

function previewText(content: string): string {
  const text = stripHtml(content).replace(/\s+/g, ' ').trim()
  return text.length > 80 ? text.slice(0, 80) + '…' : text || 'No additional text'
}

// ── Toolbar definition ────────────────────────────────────────────────────

type Btn = { icon: string; title: string; cmd: string; value?: string; iconStyle?: React.CSSProperties }

const TOOLBAR_GROUPS: (Btn | 'sep')[][] = [
  [
    { icon: 'B',  title: 'Bold',          cmd: 'bold',              iconStyle: { fontWeight: 800 } },
    { icon: 'I',  title: 'Italic',        cmd: 'italic',            iconStyle: { fontStyle: 'italic' } },
    { icon: 'U',  title: 'Underline',     cmd: 'underline',         iconStyle: { textDecoration: 'underline' } },
    { icon: 'S',  title: 'Strikethrough', cmd: 'strikeThrough',     iconStyle: { textDecoration: 'line-through' } },
  ],
  [
    { icon: '½≡', title: 'Ordered list',   cmd: 'insertOrderedList' },
    { icon: '°≡', title: 'Unordered list', cmd: 'insertUnorderedList' },
  ],
  [
    { icon: '❝',  title: 'Blockquote', cmd: 'formatBlock', value: 'blockquote' },
    { icon: '⊕',  title: 'Link',       cmd: 'createLink' },
    { icon: '⊞',  title: 'Table',      cmd: 'insertTable' },
  ],
  [
    { icon: 'M↓', title: 'Clear formatting', cmd: 'removeFormat' },
  ],
]

// ── Page ──────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes]       = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle]       = useState('')
  const [content, setContent]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const generateInputRef = useRef<HTMLInputElement>(null)

  const editorRef    = useRef<HTMLDivElement>(null)
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const titleRef     = useRef('')

  const selectedNote = notes.find(n => n.id === selectedId) ?? null

  useEffect(() => {
    fetch('/api/kuripu')
      .then(r => r.json())
      .then((data: Note[]) => {
        setNotes(data)
        if (data.length > 0) selectNote(data[0])
      })
  }, [])

  // Sync editor DOM when switching notes
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = content
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectNote(note: Note) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSelectedId(note.id)
    selectedIdRef.current = note.id
    setTitle(note.title)
    titleRef.current = note.title
    setContent(note.content)
  }

  const saveNote = useCallback(async (id: number, t: string, c: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/kuripu/${id}`, {
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
    } finally {
      setSaving(false)
    }
  }, [])

  function scheduleSave(t: string, c: string) {
    const id = selectedIdRef.current
    if (id === null) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(id, t, c), 800)
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    titleRef.current = e.target.value
    setTitle(e.target.value)
    scheduleSave(e.target.value, editorRef.current?.innerHTML ?? content)
  }

  function handleEditorInput() {
    const html = editorRef.current?.innerHTML ?? ''
    setContent(html)
    scheduleSave(titleRef.current, html)
  }

  // ── Format commands ───────────────────────────────────────────────────

  function execFormat(cmd: string, value?: string) {
    editorRef.current?.focus()
    if (cmd === 'createLink') {
      const url = window.prompt('URL:')
      if (!url) return
      document.execCommand('createLink', false, url)
    } else if (cmd === 'insertTable') {
      const cell = `<td style="border:1px solid var(--border);padding:6px 10px;min-width:80px">&nbsp;</td>`
      const row  = `<tr>${cell}${cell}${cell}</tr>`
      const table = `<table style="border-collapse:collapse;width:100%;margin:8px 0">${row}${row}${row}</table><p><br></p>`
      document.execCommand('insertHTML', false, table)
    } else if (value) {
      document.execCommand(cmd, false, value)
    } else {
      document.execCommand(cmd)
    }
    const html = editorRef.current?.innerHTML ?? ''
    setContent(html)
    scheduleSave(titleRef.current, html)
  }

  // ── AI actions ────────────────────────────────────────────────────────

  async function handleAI(action: 'summarise' | 'autotitle' | 'improve') {
    const id = selectedIdRef.current
    if (!id || aiLoading) return
    const currentContent = editorRef.current?.innerHTML ?? content
    const currentTitle = titleRef.current

    // For improve: capture selection before the async call clears it
    let savedRange: Range | null = null
    let contentToSend = currentContent
    if (action === 'improve') {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange()
        contentToSend = sel.toString()
      }
    }

    setAiLoading(action)
    try {
      const res = await fetch('/api/kuripu/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, content: contentToSend, title: currentTitle }),
      })
      const d = await res.json()
      if (!d.result) throw new Error(d.error ?? 'No result')

      if (action === 'summarise') {
        const summaryHtml = `<hr style="border:none;border-top:1px solid var(--border);margin:16px 0"><p><strong>✦ Summary</strong></p><p>${d.result.replace(/\n/g, '<br>')}</p>`
        const newContent = currentContent + summaryHtml
        if (editorRef.current) editorRef.current.innerHTML = newContent
        setContent(newContent)
        scheduleSave(currentTitle, newContent)
      } else if (action === 'autotitle') {
        const newTitle = d.result.trim()
        titleRef.current = newTitle
        setTitle(newTitle)
        scheduleSave(newTitle, currentContent)
      } else if (action === 'improve') {
        if (savedRange) {
          // Replace only the selected portion
          const sel = window.getSelection()
          if (sel) {
            sel.removeAllRanges()
            sel.addRange(savedRange)
            document.execCommand('insertHTML', false, d.result.replace(/\n/g, '<br>'))
          }
        } else {
          // Replace full note
          const lines = d.result.split('\n').filter((l: string) => l.trim())
          if (editorRef.current) editorRef.current.innerHTML = lines.map((l: string) => `<p>${l}</p>`).join('')
        }
        const newContent = editorRef.current?.innerHTML ?? ''
        setContent(newContent)
        scheduleSave(currentTitle, newContent)
      }
    } catch (err) {
      console.error('[notes/ai]', err)
    } finally {
      setAiLoading(null)
    }
  }

  async function handleGenerate() {
    const prompt = generatePrompt.trim()
    if (!prompt || aiLoading) return
    const id = selectedIdRef.current
    if (!id) return
    const currentTitle = titleRef.current
    setAiLoading('generate')
    try {
      const res = await fetch('/api/kuripu/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', content: prompt, title: currentTitle }),
      })
      const d = await res.json()
      if (!d.result) throw new Error(d.error ?? 'No result')

      // Convert plain text output to HTML paragraphs
      const newContent = d.result
        .split(/\n{2,}/)
        .map((block: string) => {
          const lines = block.split('\n').map((l: string) => l.trim()).filter(Boolean)
          if (lines.length === 1) return `<p>${lines[0]}</p>`
          return lines.map((l: string) => `<p>${l}</p>`).join('')
        })
        .join('')

      // Insert at cursor if editor has focus + cursor, otherwise append
      editorRef.current?.focus()
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        document.execCommand('insertHTML', false, newContent)
      } else {
        const existing = editorRef.current?.innerHTML ?? ''
        if (editorRef.current) editorRef.current.innerHTML = existing + newContent
      }

      const finalContent = editorRef.current?.innerHTML ?? ''
      setContent(finalContent)
      scheduleSave(currentTitle, finalContent)
      setGeneratePrompt('')
      setGenerateOpen(false)
    } catch (err) {
      console.error('[notes/generate]', err)
    } finally {
      setAiLoading(null)
    }
  }

  // ── Paste handler: images + URLs ──────────────────────────────────────

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Image paste
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = ev => {
          const src = ev.target?.result as string
          document.execCommand('insertHTML', false,
            `<img src="${src}" style="max-width:100%;border-radius:6px;margin:4px 0" />`)
          const html = editorRef.current?.innerHTML ?? ''
          setContent(html)
          scheduleSave(titleRef.current, html)
        }
        reader.readAsDataURL(file)
        return
      }
    }
    // URL auto-link
    const text = e.clipboardData.getData('text/plain').trim()
    if (/^https?:\/\/\S+$/.test(text)) {
      e.preventDefault()
      document.execCommand('insertHTML', false,
        `<a href="${text}" target="_blank" rel="noopener noreferrer">${text}</a>`)
      const html = editorRef.current?.innerHTML ?? ''
      setContent(html)
      scheduleSave(titleRef.current, html)
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  async function newNote() {
    const res = await fetch('/api/kuripu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', content: '' }),
    })
    const created: Note = await res.json()
    setNotes(prev => [created, ...prev])
    selectNote(created)
  }

  async function deleteNote(id: number) {
    await fetch(`/api/kuripu/${id}`, { method: 'DELETE' })
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      if (selectedId === id) {
        if (next.length > 0) {
          selectNote(next[0])
        } else {
          setSelectedId(null)
          selectedIdRef.current = null
          setTitle('')
          titleRef.current = ''
          setContent('')
          if (editorRef.current) editorRef.current.innerHTML = ''
        }
      }
      return next
    })
  }

  const filtered = notes.filter(n => {
    const q = search.toLowerCase()
    return n.title.toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q)
  })

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Rich-text content styles */}
      <style>{`
        .note-editor ol { list-style: decimal; padding-left: 24px; margin: 6px 0; }
        .note-editor ul { list-style: disc;    padding-left: 24px; margin: 6px 0; }
        .note-editor li { margin: 3px 0; }
        .note-editor blockquote { border-left: 3px solid var(--app-kuripu); padding-left: 14px; margin: 10px 0; color: var(--text-2); font-style: italic; }
        .note-editor a   { color: var(--app-kuripu); text-decoration: underline; text-underline-offset: 2px; }
        .note-editor table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        .note-editor td, .note-editor th { border: 1px solid var(--border); padding: 6px 10px; min-width: 80px; }
        .note-editor img { max-width: 100%; border-radius: 10px; margin: 6px 0; }
        .note-editor h1, .note-editor h2, .note-editor h3 { font-family: var(--font-display); letter-spacing: -0.02em; }
        .note-editor:empty:before { content: attr(data-placeholder); color: var(--text-3); pointer-events: none; }
        .note-editor:focus { outline: none; }

        .kuripu-note { transition: transform .28s cubic-bezier(.2,.7,.2,1), box-shadow .28s cubic-bezier(.2,.7,.2,1), border-color .28s, background .28s; }
        .kuripu-note:hover { transform: translateY(-2px); box-shadow: var(--sh-3); border-color: color-mix(in srgb, var(--app-kuripu) 45%, var(--border)); }

        .kuripu-fmt-btn { transition: background .2s, color .2s; }
        .kuripu-fmt-btn:hover { background: color-mix(in srgb, var(--app-kuripu) 14%, transparent); color: var(--text-1); }

        .kuripu-ai-btn { transition: background .2s, border-color .2s, transform .2s; }
        .kuripu-ai-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--ai) 20%, transparent); transform: translateY(-1px); }

        .kuripu-new-btn { transition: transform .2s cubic-bezier(.2,.7,.2,1), box-shadow .2s, filter .2s; }
        .kuripu-new-btn:hover { transform: translateY(-1px); filter: brightness(1.06); box-shadow: var(--tile-glow) var(--app-kuripu); }

        .kuripu-search:focus { border-color: color-mix(in srgb, var(--app-kuripu) 55%, var(--border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-kuripu) 15%, transparent); }

        .kuripu-del-btn { transition: background .2s, color .2s; }
        .kuripu-del-btn:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }

        @media (prefers-reduced-motion: reduce) {
          .kuripu-note, .kuripu-fmt-btn, .kuripu-ai-btn, .kuripu-new-btn { transition: none; }
          .kuripu-note:hover, .kuripu-ai-btn:hover, .kuripu-new-btn:hover { transform: none; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'var(--glass)', backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))',
        borderBottom: '1px solid var(--hair)', padding: '0 22px', flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', height: '54px', position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--app-kuripu)', boxShadow: 'var(--tile-glow) var(--app-kuripu)' }} />
          <span style={{ color: 'var(--text-1)', fontSize: '19px', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Kuripu</span>
        </div>
        <button onClick={newNote} className="kuripu-new-btn" style={{
          background: 'var(--app-kuripu)', color: '#04121a', border: 'none', borderRadius: '999px',
          padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ New Note</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

        {/* Note list */}
        <div style={{
          width: '284px', flexShrink: 0, borderRight: '1px solid var(--hair)',
          display: 'flex', flexDirection: 'column', background: 'var(--surface-1)',
        }}>
          <div style={{ padding: '14px 14px 8px' }}>
            <input
              className="kuripu-search"
              type="text" placeholder="Search notes…" value={search}
              onChange={e => setSearch(e.target.value)}
              suppressHydrationWarning
              style={{
                width: '100%', background: 'var(--panel)', border: '1px solid var(--border)',
                borderRadius: '999px', padding: '9px 14px', fontSize: '13px',
                color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                transition: 'border-color .2s, box-shadow .2s',
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px' }}>
                {search ? 'No matches' : 'No notes yet'}
              </div>
            )}
            {filtered.map(note => {
              const active = note.id === selectedId
              return (
              <div key={note.id} onClick={() => selectNote(note)} className="kuripu-note" style={{
                padding: '13px 15px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: active
                  ? '1px solid color-mix(in srgb, var(--app-kuripu) 55%, var(--border))'
                  : '1px solid var(--border)',
                background: active ? 'color-mix(in srgb, var(--app-kuripu) 12%, var(--card-bg))' : 'var(--card-bg)',
                boxShadow: active ? 'var(--sh-3)' : 'var(--sh-2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '8px' }}>
                  <span style={{
                    fontSize: '13.5px', fontWeight: 600, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
                    color: active ? 'var(--app-kuripu)' : 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                  }}>{note.title || 'Untitled'}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-3)', flexShrink: 0, marginTop: '2px' }}>
                    {formatDate(note.updated_at)}
                  </span>
                </div>
                <span style={{
                  fontSize: '11.5px', color: 'var(--text-2)', display: 'block', lineHeight: 1.5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {note.id === selectedId ? previewText(content) : previewText(note.content)}
                </span>
              </div>
              )
            })}
          </div>
        </div>

        {/* Editor pane */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {selectedNote ? (
            <>
              {/* Status bar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 24px', borderBottom: '1px solid var(--hair)', flexShrink: 0,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0,
                  fontSize: '11px', color: 'var(--text-3)',
                }}>
                  {saving ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--app-kuripu)', fontWeight: 600 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--app-kuripu)', boxShadow: 'var(--tile-glow) var(--app-kuripu)' }} />
                      Saving…
                    </span>
                  ) : (
                    <>
                      <span title={`Created ${formatFull(selectedNote.created_at)}`} style={{ whiteSpace: 'nowrap' }}>
                        Created {formatStamp(selectedNote.created_at)}
                      </span>
                      <span aria-hidden="true" style={{ opacity: 0.45 }}>·</span>
                      <span title={`Last modified ${formatFull(selectedNote.updated_at)}`} style={{ whiteSpace: 'nowrap' }}>
                        Edited {formatStamp(selectedNote.updated_at)}
                      </span>
                    </>
                  )}
                </div>
                <button onClick={() => deleteNote(selectedNote.id)} className="kuripu-del-btn" style={{
                  background: 'transparent', border: '1px solid var(--hair)', color: 'var(--text-3)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '999px',
                }}>Delete</button>
              </div>

              {/* Formatting toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap',
                padding: '8px 20px', borderBottom: '1px solid var(--hair)',
                flexShrink: 0, background: 'var(--glass)',
                backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))',
              }}>
                {TOOLBAR_GROUPS.map((group, gi) => (
                  <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                    {gi > 0 && (
                      <div style={{ width: '1px', height: '18px', background: 'var(--hair)', margin: '0 7px' }} />
                    )}
                    {group.map((btn) => {
                      if (btn === 'sep') return null
                      return (
                        <button
                          key={btn.cmd}
                          className="kuripu-fmt-btn"
                          title={btn.title}
                          onMouseDown={e => { e.preventDefault(); execFormat(btn.cmd, btn.value) }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            width: '30px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--text-2)',
                            fontSize: btn.icon.length > 1 ? '10px' : '14px',
                            fontFamily: 'inherit',
                            fontWeight: 500,
                            ...btn.iconStyle,
                          }}
                        >
                          {btn.icon}
                        </button>
                      )
                    })}
                  </div>
                ))}

                {/* AI tools */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '1px', height: '18px', background: 'var(--hair)', marginRight: '4px' }} />
                  {([
                    { action: 'summarise', label: '✦ Summarise', title: 'Append a bullet-point summary' },
                    { action: 'autotitle', label: '✦ Auto-title', title: 'Generate a title from content' },
                    { action: 'improve',   label: '✦ Improve',   title: 'Selection only, or full note if nothing selected' },
                  ] as const).map(({ action, label, title: tip }) => (
                    <button
                      key={action}
                      className="kuripu-ai-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleAI(action)}
                      disabled={!!aiLoading}
                      title={tip}
                      style={{
                        background: aiLoading === action
                          ? 'color-mix(in srgb, var(--ai) 22%, transparent)'
                          : 'color-mix(in srgb, var(--ai) 10%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--ai) 35%, transparent)',
                        borderRadius: '999px',
                        padding: '0 11px',
                        height: '26px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--ai)',
                        cursor: aiLoading ? 'default' : 'pointer',
                        opacity: aiLoading && aiLoading !== action ? 0.5 : 1,
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {aiLoading === action ? '…' : label}
                    </button>
                  ))}
                  <button
                    className="kuripu-ai-btn"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setGenerateOpen(o => !o); setTimeout(() => generateInputRef.current?.focus(), 50) }}
                    title="Generate content from a prompt"
                    style={{
                      background: generateOpen ? 'var(--ai)' : 'color-mix(in srgb, var(--ai) 14%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--ai) 45%, transparent)',
                      borderRadius: '999px',
                      padding: '0 11px',
                      height: '26px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: generateOpen ? '#fff' : 'var(--ai)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✦ Generate
                  </button>
                </div>
              </div>

              {/* Generate prompt bar */}
              {generateOpen && (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 20px', borderBottom: '1px solid var(--hair)', background: 'color-mix(in srgb, var(--ai) 7%, var(--surface-1))', flexShrink: 0 }}>
                  <input
                    ref={generateInputRef}
                    value={generatePrompt}
                    onChange={e => setGeneratePrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    placeholder="Describe what to write… e.g. Meeting notes for sprint planning, key decisions and action items"
                    style={{
                      flex: 1, height: '34px', padding: '0 13px', borderRadius: '999px',
                      border: '1px solid color-mix(in srgb, var(--ai) 40%, transparent)', background: 'var(--panel)',
                      color: 'var(--text-1)', fontSize: '12.5px', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={!generatePrompt.trim() || !!aiLoading}
                    style={{
                      height: '34px', padding: '0 16px', borderRadius: '999px',
                      background: !generatePrompt.trim() || aiLoading ? 'color-mix(in srgb, var(--ai) 35%, transparent)' : 'var(--ai)',
                      color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700,
                      cursor: !generatePrompt.trim() || aiLoading ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0,
                    }}
                  >
                    {aiLoading === 'generate' ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    onClick={() => setGenerateOpen(false)}
                    style={{ height: '34px', width: '34px', borderRadius: '999px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Title */}
              <input
                type="text" value={title} onChange={handleTitleChange} placeholder="Title"
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: '28px', fontWeight: 700, color: 'var(--text-1)',
                  fontFamily: 'var(--font-display)', padding: '26px 32px 10px',
                  letterSpacing: '-0.025em', flexShrink: 0,
                }}
              />

              {/* Rich text editor */}
              <div
                ref={editorRef}
                className="note-editor"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Start writing…"
                onInput={handleEditorInput}
                onPaste={handlePaste}
                style={{
                  flex: 1,
                  outline: 'none',
                  fontSize: '15px',
                  lineHeight: '1.75',
                  color: 'var(--text-1)',
                  fontFamily: 'inherit',
                  padding: '0 32px 32px',
                  overflowY: 'auto',
                }}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '76px', height: '76px', borderRadius: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px', background: 'color-mix(in srgb, var(--app-kuripu) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--app-kuripu) 30%, transparent)', boxShadow: 'var(--tile-glow) var(--app-kuripu)',
              }}>📝</div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>No note selected</span>
              <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>Create a new note to get started</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
