'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { renderMarkdown } from '@/app/components/Markdown'
import { Plus, Search, Globe, Paperclip, SendHorizontal, Trash2, Pencil, SquarePen, X, Mic, Sparkles, Menu } from 'lucide-react'

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

// Scoped reskin CSS: hover lift, composer focus glow, typing affordance,
// focus-visible rings and a narrow-viewport rail. All ambient motion is
// gated behind prefers-reduced-motion. Logic lives in the components below.
const URAI_CSS = `
.urai-root { --u: var(--app-urai); }
.urai-root .urai-lift { transition: transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease, background .2s ease, filter .2s ease; }
.urai-root .urai-lift:hover { transform: translateY(-1px); }
.urai-root .urai-cta:hover { filter: brightness(1.04); }
.urai-root .urai-send:not(:disabled):hover { filter: brightness(1.06); transform: translateY(-1px); }
.urai-root .urai-circle:hover { background: var(--accent-bg); color: var(--text-1); }
.urai-root .urai-composer { transition: box-shadow .3s ease, border-color .3s ease, transform .3s ease; }
.urai-root .urai-composer:focus-within { border-color: var(--u); box-shadow: var(--sh-3); }
.urai-root .urai-source:hover { text-decoration: underline; }
@keyframes urai-blink { 0%,80%,100% { opacity:.25; transform:translateY(0) } 40% { opacity:1; transform:translateY(-3px) } }
.urai-root .urai-dots { display:inline-flex; gap:5px; align-items:center; padding:2px 0; }
.urai-root .urai-dot { width:7px; height:7px; border-radius:50%; background:var(--u); display:inline-block; animation:urai-blink 1.2s infinite ease-in-out; }
.urai-root .urai-dot:nth-child(2) { animation-delay:.18s }
.urai-root .urai-dot:nth-child(3) { animation-delay:.36s }
.urai-root .urai-cursor { display:inline-block; width:8px; height:1.05em; margin-left:2px; border-radius:2px; background:var(--u); vertical-align:text-bottom; animation:urai-blink 1s infinite ease-in-out; }
.urai-root button:focus-visible, .urai-root a:focus-visible, .urai-root textarea:focus-visible, .urai-root input:focus-visible { outline:2px solid var(--u); outline-offset:2px; }
@media (prefers-reduced-motion: reduce) {
  .urai-root .urai-dot, .urai-root .urai-cursor { animation:none }
  .urai-root .urai-lift, .urai-root .urai-send, .urai-root .urai-composer { transition:none }
  .urai-root .urai-rail, .urai-root .urai-backdrop { transition:none !important; }
}
/* Mobile-only affordances: the hamburger bar and the drawer backdrop are
   hidden on desktop, where the rail is a static column. */
.urai-root .urai-mobile-bar { display:none; }
.urai-root .urai-backdrop { display:none; }
@media (max-width: 640px) {
  .urai-root .urai-rail {
    position:fixed; top:0; left:0; bottom:0; z-index:60;
    width:84vw !important; max-width:300px;
    transform:translateX(-100%);
    transition:transform .3s cubic-bezier(.2,.8,.2,1);
    box-shadow:var(--sh-3);
  }
  .urai-root .urai-rail.urai-rail-open { transform:translateX(0); }
  .urai-root .urai-backdrop {
    display:block; position:fixed; inset:0; z-index:55;
    background:rgba(0,0,0,.42);
    opacity:0; pointer-events:none;
    transition:opacity .3s ease;
  }
  .urai-root .urai-backdrop.urai-backdrop-open { opacity:1; pointer-events:auto; }
  .urai-root .urai-mobile-bar { display:flex; align-items:center; padding:10px 12px 0; }
  .urai-root .urai-empty-h1 { font-size:24px !important; }
}
`

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
  const [railOpen, setRailOpen] = useState(false) // mobile drawer only; ignored by CSS ≥641px

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
    setRailOpen(false)
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
    setRailOpen(false)
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
    <div className="urai-root" style={{ height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: URAI_CSS }} />

      {/* Mobile drawer backdrop (CSS-hidden ≥641px) */}
      <div
        className={`urai-backdrop${railOpen ? ' urai-backdrop-open' : ''}`}
        onClick={() => setRailOpen(false)}
        aria-hidden="true"
      />

      {/* ── Left rail ── */}
      <aside
        className={`urai-rail${railOpen ? ' urai-rail-open' : ''}`}
        style={{
          width: '264px', flexShrink: 0,
          borderRight: '1px solid var(--hair)',
          background: 'var(--glass)',
          backdropFilter: 'blur(var(--blur))',
          WebkitBackdropFilter: 'blur(var(--blur))',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '26px', height: '26px', borderRadius: '9px', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--app-urai) 0%, color-mix(in srgb, var(--app-urai) 68%, #5b1230) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--tile-glow) var(--app-urai)',
          }}>
            <Sparkles size={15} color="#fff" />
          </span>
          <span className="font-display" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)', flex: 1, letterSpacing: '-0.02em' }}>Urai</span>
        </div>

        <div style={{ padding: '6px 12px' }}>
          <button onClick={newChat} className="urai-cta urai-lift" style={ctaBtn()}>
            <SquarePen size={16} /> New chat
          </button>
        </div>

        <div style={{ padding: '4px 12px 10px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search"
            suppressHydrationWarning
            style={{ width: '100%', background: 'var(--surface-1)', border: '1px solid var(--hair)', borderRadius: '999px', padding: '8px 10px 8px 32px', fontSize: '13px', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ padding: '2px 16px 6px', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recents</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px' }}>
          {filtered.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px' }}>No conversations yet.</div>
          )}
          {filtered.map(c => {
            const active = c.id === activeId
            return (
              <div
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className="urai-conv"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 10px', borderRadius: '12px', cursor: 'pointer',
                  marginBottom: '2px',
                  // Leave non-active rows background-free so the .urai-conv:hover
                  // rule in globals.css can actually paint (inline wins over it).
                  ...(active ? {
                    background: 'color-mix(in srgb, var(--app-urai) 13%, transparent)',
                    boxShadow: 'inset 3px 0 0 var(--app-urai)',
                  } : {}),
                }}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => saveRename(c.id)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(c.id); if (e.key === 'Escape') setEditingId(null) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: '1px solid var(--app-urai)', borderRadius: '6px', padding: '3px 5px', fontSize: '13px', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: active ? 600 : 500, color: active ? 'var(--app-urai)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

        <div style={{ borderTop: '1px solid var(--hair)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--app-urai) 0%, color-mix(in srgb, var(--app-urai) 68%, #5b1230) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, boxShadow: 'var(--tile-glow) var(--app-urai)' }}>U</div>
          <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 500 }}>You</span>
        </div>
      </aside>

      {/* ── Main pane ── */}
      <div className="tp-dock-pad" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile-only: open the conversation rail as a left drawer (CSS-hidden ≥641px) */}
        <div className="urai-mobile-bar">
          <button
            onClick={() => setRailOpen(true)}
            title="Conversations"
            aria-label="Open conversations"
            className="urai-circle urai-lift"
            style={circleBtn}
          >
            <Menu size={18} />
          </button>
        </div>
        {showEmpty ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--app-urai)', background: 'color-mix(in srgb, var(--app-urai) 12%, transparent)', borderRadius: '999px', padding: '5px 12px', marginBottom: '18px' }}>
              <Sparkles size={13} /> Urai assistant
            </div>
            <h1 className="font-display urai-empty-h1" style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '26px', letterSpacing: '-0.03em', textAlign: 'center' }}>Where should we begin?</h1>
            <div style={{ width: '100%', maxWidth: '720px' }}>
              <Composer {...{ input, setInput, send, streaming, webSearch, setWebSearch, menuOpen, setMenuOpen, taRef }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
              <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {messages.map((m, i) => <MessageRow key={i} message={m} />)}
                {streaming && (
                  <MessageRow
                    message={{ role: 'assistant', content: streamText }}
                    status={status}
                    live
                  />
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            <div style={{ padding: '0 24px 22px' }}>
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

function TypingDots() {
  return (
    <span className="urai-dots" aria-label="Assistant is typing">
      <span className="urai-dot" /><span className="urai-dot" /><span className="urai-dot" />
    </span>
  )
}

function MessageRow({ message, status, live }: { message: Message; status?: string; live?: boolean }) {
  const isUser = message.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: isUser ? '82%' : '100%',
        background: isUser
          ? 'linear-gradient(135deg, var(--app-urai) 0%, color-mix(in srgb, var(--app-urai) 70%, #5b1230) 100%)'
          : 'var(--glass)',
        backdropFilter: isUser ? undefined : 'blur(var(--blur))',
        WebkitBackdropFilter: isUser ? undefined : 'blur(var(--blur))',
        border: isUser ? 'none' : '1px solid var(--hair)',
        borderRadius: isUser ? '18px 18px 6px 18px' : 'var(--radius)',
        padding: isUser ? '11px 15px' : '14px 18px',
        fontSize: '14px',
        lineHeight: 1.65,
        color: isUser ? '#fff' : 'var(--text-1)',
        boxShadow: isUser ? 'var(--tile-glow) var(--app-urai)' : 'var(--sh-2)',
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
      }}>
        {status && !message.content ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-3)' }}>
            <TypingDots /> <span style={{ fontStyle: 'italic' }}>{status}</span>
          </span>
        ) : !message.content ? (
          <TypingDots />
        ) : isUser ? (
          message.content
        ) : (
          <>
            {renderMarkdown(message.content)}
            {live && <span className="urai-cursor" aria-hidden="true" />}
          </>
        )}
      </div>
      {message.sources && message.sources.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Globe size={11} /> Sources
          </span>
          {message.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="urai-source" style={{ fontSize: '12px', color: 'var(--app-urai)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
  // Guards a late onresult from re-filling the box after the message was sent.
  const voiceLiveRef = useRef(false)

  const stopVoice = useCallback(() => {
    voiceLiveRef.current = false
    const r = recognitionRef.current
    recognitionRef.current = null
    // abort() drops pending transcripts; stop() would still flush a final onresult.
    if (r) { try { r.abort() } catch { /* already stopped */ } }
    setListening(false)
  }, [])

  // Don't leave the mic hot when the composer swaps between empty and chat state.
  useEffect(() => stopVoice, [stopVoice])

  function handleSend() {
    stopVoice()
    send()
  }

  function toggleVoice() {
    if (listening) {
      stopVoice()
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
      if (!voiceLiveRef.current) return
      let spoken = ''
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript
      spoken = spoken.trim()
      setInput(base && spoken ? `${base} ${spoken}` : (spoken || base))
    }
    r.onerror = (e: any) => {
      // stopVoice() abort()s the recogniser on send, toggle-off and unmount.
      // That arrives here as 'aborted' — we asked for it, so it's not a failure
      // to log or show.
      const selfInflicted = e.error === 'aborted' || !voiceLiveRef.current
      voiceLiveRef.current = false
      setListening(false)
      if (selfInflicted) return

      const messages: Record<string, string> = {
        'not-allowed': 'Microphone blocked — allow mic access for this site.',
        'service-not-allowed': 'Microphone blocked by the browser or OS.',
        'no-speech': "Didn't catch anything — try again.",
        'audio-capture': 'No microphone found.',
        'network': 'Speech service unreachable — network/proxy is likely blocking it.',
      }
      console.error('SpeechRecognition error:', e.error, e)
      setVoiceError(messages[e.error] ?? `Voice input failed: ${e.error}`)
    }
    r.onend = () => {
      voiceLiveRef.current = false
      recognitionRef.current = null
      setListening(false)
    }
    try {
      r.start()
      recognitionRef.current = r
      voiceLiveRef.current = true
      setListening(true)
    } catch (err) {
      console.error('SpeechRecognition start failed:', err)
      voiceLiveRef.current = false
      setVoiceError('Could not start voice input.')
      setListening(false)
    }
  }

  const canSend = !!input.trim() && !streaming

  return (
    <div style={{ position: 'relative' }}>
      {menuOpen && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--glass)', backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))', border: '1px solid var(--hair)', borderRadius: 'var(--radius-sm)', padding: '6px', minWidth: '280px', boxShadow: 'var(--sh-3)', zIndex: 20 }}>
          <button onClick={() => { setWebSearch(!webSearch); setMenuOpen(false) }} style={menuItem}>
            <Globe size={16} color="var(--app-urai)" />
            <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Web search</b> <span style={{ color: 'var(--text-3)' }}>Find real-time news and info</span></span>
            {webSearch && <span style={{ color: 'var(--app-urai)', fontSize: '12px', fontWeight: 600 }}>On</span>}
          </button>
          <div title="Coming soon" style={{ ...menuItem, opacity: 0.45, cursor: 'not-allowed' }}>
            <Paperclip size={16} />
            <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Add photos &amp; files</b> <span style={{ color: 'var(--text-3)' }}>Coming soon</span></span>
          </div>
        </div>
      )}
      <div className="urai-composer" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', background: 'var(--glass)', backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))', border: '1px solid var(--hair)', borderRadius: '26px', padding: '8px', boxShadow: 'var(--sh-2)' }}>
        <button onClick={() => setMenuOpen(!menuOpen)} title="Tools" className="urai-circle urai-lift" style={circleBtn}>
          <Plus size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '2px' }}>
          {webSearch && (
            <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'color-mix(in srgb, var(--app-urai) 14%, transparent)', color: 'var(--app-urai)', borderRadius: '999px', padding: '3px 9px', fontSize: '11px', fontWeight: 600 }}>
              <Globe size={12} /> Web search
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setWebSearch(false)} />
            </div>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={listening ? 'Listening…' : 'Ask anything'}
            rows={1}
            suppressHydrationWarning
            style={{ width: '100%', resize: 'none', maxHeight: '160px', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-1)', fontFamily: 'inherit', padding: '6px 4px' }}
          />
        </div>
        <button
          onClick={toggleVoice}
          title={listening ? 'Stop listening' : 'Voice input · use Safari (Arc/Chrome speech is blocked on this network)'}
          className="urai-circle urai-lift"
          style={{ ...circleBtn, ...(listening ? { background: 'color-mix(in srgb, var(--app-urai) 16%, transparent)', color: 'var(--app-urai)', borderColor: 'transparent', boxShadow: 'var(--tile-glow) var(--app-urai)' } : {}) }}
        >
          <Mic size={18} />
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend}
          title="Send"
          className="urai-send urai-lift"
          style={{
            ...circleBtn,
            border: canSend ? 'none' : '1px solid var(--hair)',
            background: canSend ? 'linear-gradient(135deg, var(--app-urai) 0%, color-mix(in srgb, var(--app-urai) 70%, #5b1230) 100%)' : 'var(--surface-1)',
            color: canSend ? '#fff' : 'var(--text-3)',
            boxShadow: canSend ? 'var(--tile-glow) var(--app-urai)' : 'none',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
      {voiceError && (
        <div style={{ fontSize: '11px', color: 'var(--danger)', padding: '6px 12px 0', lineHeight: 1.4 }}>{voiceError}</div>
      )}
    </div>
  )
}

// ── Style helpers ──
function ctaBtn(): React.CSSProperties {
  return {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    background: 'linear-gradient(135deg, var(--app-urai) 0%, color-mix(in srgb, var(--app-urai) 70%, #5b1230) 100%)',
    color: '#fff',
    border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: 'var(--tile-glow) var(--app-urai)',
  }
}
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px', display: 'flex', alignItems: 'center' }
const circleBtn: React.CSSProperties = { flexShrink: 0, width: '38px', height: '38px', borderRadius: '50%', border: '1px solid var(--hair)', background: 'var(--surface-1)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const menuItem: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }
