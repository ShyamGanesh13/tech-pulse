'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Search, Globe, Paperclip, SendHorizontal, Trash2, Pencil, SquarePen, X, Mic } from 'lucide-react'

interface Conversation {
  id: number
  title: string
  updated_at: string
}

interface Source {
  title: string
  url: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[] | null
}

export default function UraiPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/urai/conversations')
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, status])

  async function selectConversation(id: number) {
    if (id === activeId) return
    setActiveId(id)
    setStreamText('')
    setStatus('')
    try {
      const res = await fetch(`/api/urai/conversations/${id}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch { setMessages([]) }
  }

  function newChat() {
    setActiveId(null)
    setMessages([])
    setStreamText('')
    setStatus('')
    taRef.current?.focus()
  }

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMenuOpen(false)
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setStreaming(true)
    setStreamText('')
    setStatus('')

    let acc = ''
    let sources: Source[] = []
    try {
      const res = await fetch('/api/urai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message: text, webSearch }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line)
          if (evt.type === 'meta') {
            if (!activeId) setActiveId(evt.conversationId)
          } else if (evt.type === 'status') {
            setStatus(evt.text)
          } else if (evt.type === 'token') {
            setStatus('')
            acc += evt.value
            setStreamText(acc)
          } else if (evt.type === 'done') {
            sources = evt.sources ?? []
          }
        }
      }
    } catch {
      acc = acc || '⚠ Something went wrong. Please try again.'
    } finally {
      setMessages(prev => [...prev, { role: 'assistant', content: acc, sources: sources.length ? sources : null }])
      setStreaming(false)
      setStreamText('')
      setStatus('')
      loadConversations()
    }
  }

  async function del(id: number) {
    await fetch(`/api/urai/conversations/${id}`, { method: 'DELETE' })
    if (id === activeId) newChat()
    loadConversations()
  }

  async function saveRename(id: number) {
    const title = editTitle.trim()
    setEditingId(null)
    if (!title) return
    await fetch(`/api/urai/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    loadConversations()
  }

  const filtered = filter
    ? conversations.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
    : conversations
  const showEmpty = messages.length === 0 && !streaming

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--bg)' }}>
      {/* ── Left rail ── */}
      <aside style={{ width: '260px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 12px 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, letterSpacing: '-0.02em' }}>Urai</span>
        </div>

        <div style={{ padding: '4px 8px' }}>
          <button onClick={newChat} style={railBtn(true)}>
            <SquarePen size={16} /> New chat
          </button>
        </div>

        <div style={{ padding: '4px 12px 8px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search"
            suppressHydrationWarning
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 8px 6px 28px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recents</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px' }}>
          {filtered.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>No conversations yet.</div>
          )}
          {filtered.map(c => {
            const active = c.id === activeId
            return (
              <div
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className="urai-conv"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', borderRadius: '8px', cursor: 'pointer', background: active ? 'var(--accent-bg)' : 'transparent', marginBottom: '1px' }}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => saveRename(c.id)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(c.id); if (e.key === 'Escape') setEditingId(null) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: '4px', padding: '2px 4px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: active ? 'var(--accent)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </span>
                )}
                <button className="urai-conv-act" title="Rename" onClick={e => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title) }} style={iconBtn}>
                  <Pencil size={13} />
                </button>
                <button className="urai-conv-act" title="Delete" onClick={e => { e.stopPropagation(); del(c.id) }} style={iconBtn}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>U</div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>You</span>
        </div>
      </aside>

      {/* ── Main pane ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {showEmpty ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px', letterSpacing: '-0.02em' }}>Where should we begin?</h1>
            <div style={{ width: '100%', maxWidth: '720px' }}>
              <Composer {...{ input, setInput, send, streaming, webSearch, setWebSearch, menuOpen, setMenuOpen, taRef }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
              <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {messages.map((m, i) => <MessageRow key={i} message={m} />)}
                {streaming && (
                  <MessageRow
                    message={{ role: 'assistant', content: streamText }}
                    status={status}
                  />
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            <div style={{ padding: '0 24px 20px' }}>
              <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                <Composer {...{ input, setInput, send, streaming, webSearch, setWebSearch, menuOpen, setMenuOpen, taRef }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessageRow({ message, status }: { message: Message; status?: string }) {
  const isUser = message.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: isUser ? '85%' : '100%',
        background: isUser ? 'var(--accent-bg)' : 'transparent',
        border: isUser ? '1px solid var(--border)' : 'none',
        borderRadius: '14px',
        padding: isUser ? '10px 14px' : '0',
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {status && !message.content ? (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{status}</span>
        ) : (
          message.content || <span style={{ color: 'var(--text-muted)' }}>…</span>
        )}
      </div>
      {message.sources && message.sources.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</span>
          {message.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {i + 1}. {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

interface ComposerProps {
  input: string
  setInput: (v: string) => void
  send: () => void
  streaming: boolean
  webSearch: boolean
  setWebSearch: (v: boolean) => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  taRef: React.RefObject<HTMLTextAreaElement | null>
}

function Composer({ input, setInput, send, streaming, webSearch, setWebSearch, menuOpen, setMenuOpen, taRef }: ComposerProps) {
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    setVoiceError(null)
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setVoiceError('Voice input needs Chrome, Edge, or Safari.')
      return
    }
    const base = input.trim()
    const r = new SR()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    r.onresult = (e: any) => {
      let spoken = ''
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript
      spoken = spoken.trim()
      setInput(base && spoken ? `${base} ${spoken}` : (spoken || base))
    }
    r.onerror = (e: any) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone blocked — allow mic access for this site.',
        'service-not-allowed': 'Microphone blocked by the browser or OS.',
        'no-speech': "Didn't catch anything — try again.",
        'audio-capture': 'No microphone found.',
        'network': 'Speech service unreachable — network/proxy is likely blocking it.',
      }
      console.error('SpeechRecognition error:', e.error, e)
      setVoiceError(messages[e.error] ?? `Voice input failed: ${e.error}`)
      setListening(false)
    }
    r.onend = () => setListening(false)
    try {
      r.start()
      recognitionRef.current = r
      setListening(true)
    } catch (err) {
      console.error('SpeechRecognition start failed:', err)
      setVoiceError('Could not start voice input.')
      setListening(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {menuOpen && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '6px', minWidth: '280px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 20 }}>
          <button onClick={() => { setWebSearch(!webSearch); setMenuOpen(false) }} style={menuItem}>
            <Globe size={16} />
            <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Web search</b> <span style={{ color: 'var(--text-muted)' }}>Find real-time news and info</span></span>
            {webSearch && <span style={{ color: 'var(--accent)', fontSize: '12px' }}>On</span>}
          </button>
          <div title="Coming soon" style={{ ...menuItem, opacity: 0.45, cursor: 'not-allowed' }}>
            <Paperclip size={16} />
            <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Add photos &amp; files</b> <span style={{ color: 'var(--text-muted)' }}>Coming soon</span></span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '24px', padding: '8px 8px 8px 8px' }}>
        <button onClick={() => setMenuOpen(!menuOpen)} title="Tools" style={{ ...circleBtn, background: 'var(--bg)' }}>
          <Plus size={18} />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '2px' }}>
          {webSearch && (
            <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-bg)', color: 'var(--accent)', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
              <Globe size={12} /> Web search
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setWebSearch(false)} />
            </div>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={listening ? 'Listening…' : 'Ask anything'}
            rows={1}
            suppressHydrationWarning
            style={{ width: '100%', resize: 'none', maxHeight: '160px', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontFamily: 'inherit', padding: '6px 4px' }}
          />
        </div>
        <button
          onClick={toggleVoice}
          title={listening ? 'Stop listening' : 'Voice input · works best in Google Chrome'}
          style={{ ...circleBtn, background: listening ? 'var(--accent-bg)' : 'var(--bg)', color: listening ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          <Mic size={18} />
        </button>
        <button onClick={send} disabled={streaming || !input.trim()} title="Send" style={{ ...circleBtn, background: input.trim() && !streaming ? 'var(--accent)' : 'var(--bg)', color: input.trim() && !streaming ? '#fff' : 'var(--text-muted)', cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer' }}>
          <SendHorizontal size={18} />
        </button>
      </div>
      {voiceError && (
        <div style={{ fontSize: '11px', color: '#f87171', padding: '6px 12px 0', lineHeight: 1.4 }}>{voiceError}</div>
      )}
    </div>
  )
}

// ── Style helpers ──
function railBtn(active: boolean): React.CSSProperties {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }
}
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }
const circleBtn: React.CSSProperties = { flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const menuItem: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }
