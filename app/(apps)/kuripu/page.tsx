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
        .note-editor ol { list-style: decimal; padding-left: 22px; margin: 4px 0; }
        .note-editor ul { list-style: disc;    padding-left: 22px; margin: 4px 0; }
        .note-editor li { margin: 2px 0; }
        .note-editor blockquote { border-left: 3px solid var(--accent); padding-left: 12px; margin: 6px 0; color: var(--text-muted); font-style: italic; }
        .note-editor a   { color: var(--accent); text-decoration: underline; }
        .note-editor table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .note-editor td, .note-editor th { border: 1px solid var(--border); padding: 6px 10px; min-width: 80px; }
        .note-editor img { max-width: 100%; border-radius: 6px; margin: 4px 0; }
        .note-editor:empty:before { content: attr(data-placeholder); color: var(--text-muted); pointer-events: none; }
        .note-editor:focus { outline: none; }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'var(--card-bg)', borderBottom: '1px solid var(--border)',
        padding: '0 20px', flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '36px',
      }}>
        <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>Kuripu</span>
        <button onClick={newNote} style={{
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '6px',
          padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ New Note</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

        {/* Note list */}
        <div style={{
          width: '260px', flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', background: 'var(--card-bg)',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text" placeholder="Search notes…" value={search}
              onChange={e => setSearch(e.target.value)}
              suppressHydrationWarning
              style={{
                width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '5px 10px', fontSize: '12px',
                color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                {search ? 'No matches' : 'No notes yet'}
              </div>
            )}
            {filtered.map(note => (
              <div key={note.id} onClick={() => selectNote(note)} style={{
                padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: note.id === selectedId ? 'var(--accent-bg)' : 'transparent',
                transition: 'background 0.1s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3px' }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 600,
                    color: note.id === selectedId ? 'var(--accent)' : 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                  }}>{note.title || 'Untitled'}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>
                    {formatDate(note.updated_at)}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px', color: 'var(--text-muted)', display: 'block',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {note.id === selectedId ? previewText(content) : previewText(note.content)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Editor pane */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {selectedNote ? (
            <>
              {/* Status bar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {saving ? 'Saving…' : `Edited ${formatDate(selectedNote.updated_at)}`}
                </span>
                <button onClick={() => deleteNote(selectedNote.id)} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: '4px',
                }}>Delete</button>
              </div>

              {/* Formatting toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                padding: '5px 20px', borderBottom: '1px solid var(--border)',
                flexShrink: 0, background: 'var(--card-bg)',
              }}>
                {TOOLBAR_GROUPS.map((group, gi) => (
                  <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                    {gi > 0 && (
                      <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 6px' }} />
                    )}
                    {group.map((btn) => {
                      if (btn === 'sep') return null
                      return (
                        <button
                          key={btn.cmd}
                          title={btn.title}
                          onMouseDown={e => { e.preventDefault(); execFormat(btn.cmd, btn.value) }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '5px',
                            width: '28px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: btn.icon.length > 1 ? '10px' : '13px',
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
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '1px', height: '16px', background: 'var(--border)', marginRight: '4px' }} />
                  {([
                    { action: 'summarise', label: '✦ Summarise', title: 'Append a bullet-point summary' },
                    { action: 'autotitle', label: '✦ Auto-title', title: 'Generate a title from content' },
                    { action: 'improve',   label: '✦ Improve',   title: 'Selection only, or full note if nothing selected' },
                  ] as const).map(({ action, label, title: tip }) => (
                    <button
                      key={action}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleAI(action)}
                      disabled={!!aiLoading}
                      title={tip}
                      style={{
                        background: aiLoading === action ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.08)',
                        border: '1px solid rgba(167,139,250,0.3)',
                        borderRadius: '5px',
                        padding: '0 8px',
                        height: '24px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#a78bfa',
                        cursor: aiLoading ? 'default' : 'pointer',
                        opacity: aiLoading && aiLoading !== action ? 0.5 : 1,
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {aiLoading === action ? '…' : label}
                    </button>
                  ))}
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setGenerateOpen(o => !o); setTimeout(() => generateInputRef.current?.focus(), 50) }}
                    title="Generate content from a prompt"
                    style={{
                      background: generateOpen ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)',
                      border: '1px solid rgba(99,102,241,0.4)',
                      borderRadius: '5px',
                      padding: '0 8px',
                      height: '24px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#818cf8',
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
                <div style={{ display: 'flex', gap: '8px', padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.05)', flexShrink: 0 }}>
                  <input
                    ref={generateInputRef}
                    value={generatePrompt}
                    onChange={e => setGeneratePrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    placeholder="Describe what to write… e.g. Meeting notes for sprint planning, key decisions and action items"
                    style={{
                      flex: 1, height: '32px', padding: '0 10px', borderRadius: '6px',
                      border: '1px solid rgba(99,102,241,0.4)', background: 'var(--bg)',
                      color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={!generatePrompt.trim() || !!aiLoading}
                    style={{
                      height: '32px', padding: '0 14px', borderRadius: '6px',
                      background: !generatePrompt.trim() || aiLoading ? 'rgba(99,102,241,0.3)' : '#6366f1',
                      color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600,
                      cursor: !generatePrompt.trim() || aiLoading ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0,
                    }}
                  >
                    {aiLoading === 'generate' ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    onClick={() => setGenerateOpen(false)}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
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
                  fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)',
                  fontFamily: 'inherit', padding: '20px 24px 8px',
                  letterSpacing: '-0.02em', flexShrink: 0,
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
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  padding: '0 24px 24px',
                  overflowY: 'auto',
                }}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
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
