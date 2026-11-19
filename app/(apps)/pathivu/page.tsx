'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Mic, Square, Loader2, Save, CalendarRange, CalendarDays, AlertTriangle, Check, BookOpen } from 'lucide-react'
import { renderMarkdown } from '@/app/components/Markdown'

// Pathivu — the long-horizon work journal. Speak (or type) the day, get a
// polished draft, edit it by hand, save it under the date. Weekly and Monthly
// read the range back through the model. Scoped CSS in the Ninaivu style:
// --pvh/--pvh-soft carry the signature hue, ambient motion is reduced-motion
// gated, and a phone block reflows the two columns into one.
const PATHIVU_CSS = `
.pathivu-root button { font-family: inherit; }
.pathivu-root ::selection { background: color-mix(in srgb, var(--app-pathivu) 28%, transparent); }
.pathivu-root textarea:focus {
  border-color: var(--pvh) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-pathivu) 20%, transparent);
}
.pathivu-root button:focus-visible { outline: 2px solid var(--pvh); outline-offset: 2px; }
.pv-btn { transition: filter .18s, box-shadow .2s, transform .18s, border-color .2s, background .2s, color .2s; }
.pv-btn:disabled { opacity: .5; cursor: default !important; }
.pv-btn-primary:hover:not(:disabled) { filter: brightness(1.07); box-shadow: 0 8px 22px -10px color-mix(in srgb, var(--app-pathivu) 85%, transparent); transform: translateY(-1px); }
.pv-btn-ghost:hover:not(:disabled) { border-color: var(--pvh); color: var(--pvh); background: var(--pvh-soft); }
.pv-cell { transition: background .18s; }
.pv-cell:hover:not(:disabled) { background: var(--pvh-soft); }
@keyframes pv-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--crit) 45%, transparent); } 50% { box-shadow: 0 0 0 12px transparent; } }
.pv-rec.on { animation: pv-pulse 1.6s ease-in-out infinite; }
@keyframes pv-spin { to { transform: rotate(360deg); } }
.pv-spin { animation: pv-spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .pv-btn, .pv-cell { transition: none; }
  .pv-rec.on, .pv-spin { animation: none; }
}
/* ── Phone layout (mobile-only; desktop ≥768px untouched) ─────────────── */
@media (max-width: 767px) {
  .pv-body { padding: 12px !important; padding-bottom: 96px !important; }
  .pv-topbar { padding: 0 12px !important; gap: 6px !important; }
  .pv-cols { grid-template-columns: 1fr !important; }
  .pv-date-long { display: none; }
}
`

// ── Types ──────────────────────────────────────────────────────────────────

interface Entry {
  id: string
  entry_date: string
  content: string
  raw_transcript: string
  updated_at: string
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'polishing'
type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

interface Report {
  range: 'week' | 'month'
  findings: string | null
  from: string
  to: string
  entries: number
  error?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** IST calendar day, matching the server's notion of "today". */
function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function shiftDay(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** Local, per-day copy of an unsaved edit, so a reload or a day switch never
 *  loses typing. The entry itself lives in the database, never here. */
const draftKey = (date: string) => `pathivu-draft:${date}`
function readDraft(date: string): string | null {
  try { return localStorage.getItem(draftKey(date)) } catch { return null }
}
function writeDraft(date: string, text: string | null) {
  try { text === null ? localStorage.removeItem(draftKey(date)) : localStorage.setItem(draftKey(date), text) } catch { /* private mode */ }
}

/** Long dictations are fine (5 min ≈ 3 MB of Opus); this only stops a forgotten mic. */
const MAX_RECORD_SEC = 15 * 60

// ── Card shell ─────────────────────────────────────────────────────────────

function Card({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--sh-2)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', borderBottom: '1px solid var(--hair)', flexShrink: 0 }}>
        <span style={{ width: '30px', height: '30px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pvh)', background: 'var(--pvh-soft)', border: '1px solid color-mix(in srgb, var(--app-pathivu) 28%, transparent)', boxShadow: 'var(--tile-glow) var(--app-pathivu)', flexShrink: 0 }}>
          {icon}
        </span>
        <span className="font-display" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)', flex: 1 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px',
  color: 'var(--text-2)', fontSize: '12.5px', fontWeight: 600, padding: '0 12px', height: '32px', cursor: 'pointer',
}

// ── Month picker ───────────────────────────────────────────────────────────

function MonthPicker({ selected, today, onPick }: { selected: string; today: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(selected.slice(0, 7))
  const [days, setDays] = useState<Set<number>>(new Set())

  useEffect(() => { setMonth(selected.slice(0, 7)) }, [selected])
  useEffect(() => {
    let live = true
    fetch(`/api/pathivu?month=${month}`).then(r => r.json()).then(d => { if (live) setDays(new Set(d.days ?? [])) }).catch(() => {})
    return () => { live = false }
  }, [month, selected]) // `selected` too: a save on the open day adds its dot

  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const lead = (first + 6) % 7 // Monday-first, matching the work week
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div style={{ padding: '12px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <button className="pv-btn pv-btn-ghost" onClick={() => shift(-1)} aria-label="Previous month" style={{ ...ghostBtn, padding: 0, width: '32px', border: 'none' }}><ChevronLeft size={16} /></button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>
        <button className="pv-btn pv-btn-ghost" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Next month" style={{ ...ghostBtn, padding: 0, width: '32px', border: 'none' }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0' }}>{d}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={`l${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1
          const date = `${month}-${String(day).padStart(2, '0')}`
          const isSel = date === selected
          const future = date > today
          const has = days.has(day)
          return (
            <button key={day} className="pv-cell" disabled={future} onClick={() => onPick(date)}
              aria-label={`${shortDate(date)}${has ? ', has an entry' : ''}`} aria-current={isSel ? 'date' : undefined}
              style={{
                position: 'relative', height: '34px', border: 'none', borderRadius: '9px', cursor: future ? 'default' : 'pointer',
                fontSize: '12.5px', fontWeight: isSel || date === today ? 700 : 500,
                background: isSel ? 'var(--pvh)' : 'transparent',
                color: isSel ? '#fff' : future ? 'var(--text-3)' : date === today ? 'var(--pvh)' : 'var(--text-1)',
                opacity: future ? 0.45 : 1,
              }}>
              {day}
              {has && <span style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: isSel ? '#fff' : 'var(--pvh)' }} />}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--pvh)' }} /> a day with an entry
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PathivuPage() {
  const [today, setToday] = useState(istToday)
  const [date, setDate] = useState(today)
  const [saved, setSaved] = useState<Entry | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [saveError, setSaveError] = useState('')
  // This session's dictation for the open day, sent with the next save and then
  // cleared. Typing alone never sends one.
  const pendingRaw = useRef<string[]>([])

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [captureNote, setCaptureNote] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState<'week' | 'month' | null>(null)

  const dirty = saveState === 'dirty' || saveState === 'error'
  const textRef = useRef(text); textRef.current = text
  const savedRef = useRef(saved); savedRef.current = saved

  // ── Load a day ───────────────────────────────────────────────────────────
  const loadDay = useCallback(async (d: string) => {
    setLoading(true)
    setSaveError('')
    pendingRaw.current = []
    try {
      const res = await fetch(`/api/pathivu?date=${d}`)
      const data = await res.json()
      const entry: Entry | null = data.entry ?? null
      setSaved(entry)
      // An unsaved local draft for this day wins over the stored entry, and
      // stays marked unsaved until it is saved or discarded.
      const local = readDraft(d)
      if (local !== null && local !== (entry?.content ?? '')) {
        setText(local); setSaveState('dirty')
      } else {
        writeDraft(d, null)
        setText(entry?.content ?? ''); setSaveState(entry ? 'saved' : 'clean')
      }
    } catch {
      setSaved(null); setText(readDraft(d) ?? ''); setSaveState('error'); setSaveError('Could not load this day — check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  // "Today" rolls over at IST midnight for a tab left open.
  useEffect(() => {
    const t = setInterval(() => setToday(istToday()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Leaving the page with an unsaved edit: the local draft already holds it,
  // but say so rather than let it look saved.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function goTo(d: string) {
    if (d === date || d > today || phase !== 'idle') return
    // The draft is kept per day in localStorage, so switching is safe; it is
    // still worth one line so an unsaved day isn't forgotten.
    if (dirty && !window.confirm('This day has unsaved changes. They are kept as a draft on this device — switch anyway?')) return
    setDate(d)
  }

  function onEdit(v: string) {
    setText(v)
    setSaveState(v === (savedRef.current?.content ?? '') && !pendingRaw.current.length ? (savedRef.current ? 'saved' : 'clean') : 'dirty')
    writeDraft(date, v === (savedRef.current?.content ?? '') ? null : v)
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function save() {
    if (saveState === 'saving') return
    setSaveState('saving'); setSaveError('')
    const raw = pendingRaw.current.join('\n\n').trim()
    try {
      const res = await fetch('/api/pathivu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_date: date, content: textRef.current, ...(raw ? { raw_transcript: raw } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`)
      pendingRaw.current = []
      setSaved(data.entry)
      writeDraft(date, null)
      // Still dirty if the text changed while the request was in flight.
      setSaveState(textRef.current === data.entry.content ? 'saved' : 'dirty')
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // ⌘/Ctrl+S saves — the keyboard path is first-class.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Capture: record → transcribe → polish → draft ────────────────────────
  async function startRecording() {
    setCaptureNote(null)
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCaptureNote({ kind: 'error', text: 'Voice capture needs a secure (https) page and a browser with microphone recording. You can type the entry below instead.' })
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setCaptureNote({ kind: 'error', text: denied
        ? 'Microphone access was blocked. Allow it in the browser’s site settings to dictate — or just type the entry below.'
        : 'No microphone was found. You can type the entry below.' })
      return
    }
    // Chrome/Firefox record Opus in WebM; Safari only does MP4/AAC.
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunks.current = []
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      if (timer.current) clearInterval(timer.current)
      const blob = new Blob(chunks.current, { type: rec.mimeType || mime || 'audio/webm' })
      void processRecording(blob)
    }
    recorder.current = rec
    rec.start(1000)
    setElapsed(0)
    setPhase('recording')
    const started = Date.now()
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000)
      setElapsed(s)
      if (s >= MAX_RECORD_SEC) stopRecording()
    }, 250)
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  async function processRecording(blob: Blob) {
    if (!blob.size) { setPhase('idle'); setCaptureNote({ kind: 'error', text: 'Nothing was recorded — try again.' }); return }
    setPhase('transcribing')
    let transcript = ''
    try {
      const form = new FormData()
      form.append('audio', blob, blob.type.includes('mp4') ? 'dictation.m4a' : 'dictation.webm')
      const res = await fetch('/api/pathivu/transcribe', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Transcription failed (${res.status})`)
      transcript = data.text
    } catch (err) {
      setPhase('idle')
      setCaptureNote({ kind: 'error', text: `${err instanceof Error ? err.message : 'Transcription failed'}. The recording was not saved — please dictate again or type it.` })
      return
    }
    pendingRaw.current.push(transcript)

    setPhase('polishing')
    let draft = textRef.current.trim() ? `${textRef.current.trim()}\n\n${transcript}` : transcript
    let polished = false
    try {
      const res = await fetch('/api/pathivu/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, entry_date: date, existing: textRef.current }),
      })
      const data = await res.json()
      if (res.ok && typeof data.draft === 'string') { draft = data.draft; polished = !!data.polished }
    } catch { /* keep the plain merge below */ }

    setText(draft)
    setSaveState('dirty')
    writeDraft(date, draft)
    setPhase('idle')
    setCaptureNote(polished
      ? { kind: 'info', text: 'Draft ready — read it through, fix anything misheard, then save.' }
      : { kind: 'info', text: 'Transcribed, but the AI tidy-up was unavailable, so this is the raw dictation. Edit and save as usual.' })
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  async function runReport(range: 'week' | 'month') {
    setReportLoading(range)
    try {
      const res = await fetch(`/api/pathivu/report?range=${range}`)
      const data = await res.json()
      setReport({ range, findings: data.findings ?? null, from: data.from, to: data.to, entries: data.entries ?? 0, ...(res.ok ? {} : { error: data.error ?? 'Report failed' }) })
    } catch {
      setReport({ range, findings: null, from: '', to: '', entries: 0, error: 'Could not reach the server.' })
    } finally {
      setReportLoading(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const busy = phase === 'transcribing' || phase === 'polishing'
  const saveLabel: Record<SaveState, React.ReactNode> = {
    clean: <span style={{ color: 'var(--text-3)' }}>Nothing saved for this day yet</span>,
    dirty: <span style={{ color: 'var(--pvh)', fontWeight: 600 }}>● Unsaved changes</span>,
    saving: <span style={{ color: 'var(--text-3)' }}>Saving…</span>,
    saved: <span style={{ color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={13} /> Saved{saved ? ` ${new Date(saved.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>,
    error: <span role="alert" style={{ color: 'var(--danger)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={13} /> {saveError || 'Not saved'}</span>,
  }

  return (
    <div
      className="pathivu-root"
      style={{
        ['--pvh' as string]: 'var(--app-pathivu)',
        ['--pvh-soft' as string]: 'color-mix(in srgb, var(--app-pathivu) 14%, transparent)',
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(120% 90% at 100% -10%, color-mix(in srgb, var(--app-pathivu) 10%, transparent) 0%, transparent 55%), var(--bg)',
      } as React.CSSProperties}
    >
      <style>{PATHIVU_CSS}</style>

      {/* Header: the day being viewed */}
      <div className="pv-topbar" style={{ background: 'var(--glass-head)', borderBottom: '1px solid var(--hair)', padding: '0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', height: '52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--app-pathivu)', boxShadow: 'var(--tile-glow) var(--app-pathivu)' }} />
          <span className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Pathivu</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="pv-btn pv-btn-ghost" onClick={() => goTo(shiftDay(date, -1))} disabled={busy || phase === 'recording'} aria-label="Previous day" style={{ ...ghostBtn, padding: 0, width: '32px' }}><ChevronLeft size={16} /></button>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
            <span className="pv-date-long">{longDate(date)}</span>
            <span className="pv-date-short" style={{ display: 'none' }}>{shortDate(date)}</span>
          </div>
        </div>
        <button className="pv-btn pv-btn-ghost" onClick={() => goTo(shiftDay(date, 1))} disabled={date >= today || busy || phase === 'recording'} aria-label="Next day" style={{ ...ghostBtn, padding: 0, width: '32px' }}><ChevronRight size={16} /></button>
        <button className="pv-btn pv-btn-ghost" onClick={() => goTo(today)} disabled={date === today || busy || phase === 'recording'} style={ghostBtn}>Today</button>
      </div>
      <style>{`@media (max-width: 767px) { .pathivu-root .pv-date-short { display: inline !important; } }`}</style>

      <div className="pv-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', paddingBottom: '104px', boxSizing: 'border-box' }}>
        <div className="pv-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '18px', alignItems: 'start', maxWidth: '1180px', margin: '0 auto' }}>

          {/* ── Left: capture + editor ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
            <Card title={date === today ? 'Today’s entry' : `Entry for ${shortDate(date)}`} icon={<BookOpen size={16} />}
              right={<span style={{ fontSize: '12px' }}>{saveLabel[saveState]}</span>}>
              {/* Capture */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', borderBottom: '1px solid var(--hair)', flexWrap: 'wrap' }}>
                {phase === 'recording' ? (
                  <button className="pv-btn pv-rec on" onClick={stopRecording} aria-label="Stop recording"
                    style={{ width: '56px', height: '56px', borderRadius: '50%', border: 'none', background: 'var(--crit)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <Square size={20} fill="currentColor" />
                  </button>
                ) : (
                  <button className="pv-btn pv-btn-primary pv-rec" onClick={startRecording} disabled={busy || loading} aria-label="Start dictating"
                    style={{ width: '56px', height: '56px', borderRadius: '50%', border: 'none', background: 'var(--pvh)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {busy ? <Loader2 size={22} className="pv-spin" /> : <Mic size={22} />}
                  </button>
                )}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {phase === 'recording' ? <>Recording · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mmss(elapsed)}</span></>
                      : phase === 'transcribing' ? 'Transcribing your dictation…'
                      : phase === 'polishing' ? 'Tidying it into a draft…'
                      : saved?.content || text ? 'Dictate more to add to this day' : 'Speak about your day'}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
                    {phase === 'recording' ? 'Tap stop when you’re done — five minutes is plenty.'
                      : phase === 'transcribing' ? 'A few minutes of audio takes a little while.'
                      : phase === 'polishing' ? 'Nothing is invented; misheard words are left for you to fix.'
                      : 'Tap the mic, talk it through, then edit the draft below. Or just type.'}
                  </div>
                </div>
              </div>
              {captureNote && (
                <div role={captureNote.kind === 'error' ? 'alert' : 'status'} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '12px 18px 0', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5,
                  background: captureNote.kind === 'error' ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'var(--pvh-soft)',
                  color: captureNote.kind === 'error' ? 'var(--danger)' : 'var(--text-2)' }}>
                  {captureNote.kind === 'error' ? <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> : <Check size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--pvh)' }} />}
                  <span>{captureNote.text}</span>
                </div>
              )}

              {/* Editor */}
              <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <textarea
                  value={text}
                  onChange={e => onEdit(e.target.value)}
                  disabled={loading || busy}
                  aria-label="Journal entry"
                  placeholder={loading ? 'Loading…' : 'Type what you worked on today — what you did, what’s still pending, what blocked you, what you learned. Markdown works: “## What I did” and “- ” bullets.\n\nNo microphone needed; ⌘/Ctrl+S saves.'}
                  style={{ width: '100%', minHeight: '320px', resize: 'vertical', boxSizing: 'border-box', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)', fontSize: '14px', lineHeight: 1.65, fontFamily: 'inherit', outline: 'none' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', color: text.length > 9000 ? 'var(--danger)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {text.length.toLocaleString()} / 10,000
                  </span>
                  <div style={{ flex: 1 }} />
                  {dirty && saved && (
                    <button className="pv-btn pv-btn-ghost" onClick={() => { writeDraft(date, null); pendingRaw.current = []; setText(saved.content); setSaveState('saved') }} style={ghostBtn}>
                      Discard changes
                    </button>
                  )}
                  <button className="pv-btn pv-btn-primary" onClick={save} disabled={!dirty || loading || busy || phase === 'recording' || !text.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 18px', borderRadius: '11px', border: 'none', background: 'var(--pvh)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    {saveState === 'saving' ? <Loader2 size={15} className="pv-spin" /> : <Save size={15} />} Save {date === today ? 'today' : shortDate(date)}
                  </button>
                </div>
              </div>
            </Card>

            {/* Report */}
            {(report || reportLoading) && (
              <Card title={report ? (report.range === 'week' ? 'This week' : 'This month') : 'Reading your entries…'} icon={reportLoading === 'month' || report?.range === 'month' ? <CalendarDays size={16} /> : <CalendarRange size={16} />}
                right={report && !reportLoading && report.from ? <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{shortDate(report.from)} → {shortDate(report.to)} · {report.entries} {report.entries === 1 ? 'entry' : 'entries'}</span> : undefined}>
                <div style={{ padding: '14px 18px 18px', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-1)' }}>
                  {reportLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-3)' }}><Loader2 size={15} className="pv-spin" /> Reading the {reportLoading === 'week' ? 'week' : 'month'}’s entries…</span>
                  ) : report?.error ? (
                    <span role="alert" style={{ color: 'var(--danger)' }}>{report.error}</span>
                  ) : report && !report.findings ? (
                    <span style={{ color: 'var(--text-3)' }}>No entries {report.range === 'week' ? 'this week' : 'this month'} yet — the report reads what you’ve written, so there’s nothing to find until you’ve saved a day.</span>
                  ) : report?.findings ? renderMarkdown(report.findings) : null}
                </div>
              </Card>
            )}
          </div>

          {/* ── Right: calendar + reports ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
            <Card title="Findings" icon={<CalendarRange size={16} />}>
              <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-3)', lineHeight: 1.5 }}>What shipped, what’s still open and since when, and what you learned — read from your entries.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['week', 'month'] as const).map(r => (
                    <button key={r} className="pv-btn pv-btn-ghost" onClick={() => runReport(r)} disabled={reportLoading !== null}
                      style={{ ...ghostBtn, height: '40px', fontSize: '13px', ...(report?.range === r ? { borderColor: 'var(--pvh)', color: 'var(--pvh)', background: 'var(--pvh-soft)' } : {}) }}>
                      {reportLoading === r ? <Loader2 size={14} className="pv-spin" /> : r === 'week' ? <CalendarRange size={14} /> : <CalendarDays size={14} />}
                      {r === 'week' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Days" icon={<CalendarDays size={16} />}>
              <MonthPicker selected={date} today={today} onPick={goTo} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
