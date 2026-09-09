'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Source } from '@/lib/source-registry'

export interface FeedPrefs {
  sources: Source[]
  topics: string[]
}

interface Catalog {
  sources: { key: Source; label: string }[]
  topics: string[]
}

/**
 * The gear panel: a tenant's durable choice of which sources and topics
 * Thagaval subscribes to.
 *
 * DELIBERATELY NOT THE SAME CONTROL AS THE LEFT RAIL. What is saved here decides
 * what a refresh actually fetches, so it commits on an explicit Save rather than
 * on every click — a stray toggle must not silently shrink the next fetch. The
 * rail stays a transient "what am I looking at right now" filter over whatever
 * is enabled here.
 */
export default function FeedSettings({
  onClose, onSaved,
}: {
  onClose: () => void
  onSaved: (prefs: FeedPrefs) => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Catalog and current selection arrive together, so opening the panel is one
  // request rather than one per list.
  useEffect(() => {
    let cancelled = false
    fetch('/api/articles/preferences')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setCatalog(d.catalog)
        setSources(d.sources ?? [])
        setTopics(d.topics ?? [])
      })
      .catch(() => !cancelled && setError('Could not load your preferences.'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Zero of either means an empty fetch and an empty feed. The API rejects it;
  // blocking Save is what lets us say why before they hit that.
  const invalid = sources.length === 0
    ? 'Select at least one source'
    : topics.length === 0 ? 'Select at least one topic' : null

  async function save() {
    if (invalid) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/articles/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, topics }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save.')
        return
      }
      onSaved({ sources: body.sources, topics: body.topics })
      onClose()
    } catch {
      setError('Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.4)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px',
          width: '100%', maxWidth: '520px', maxHeight: 'calc(100vh - 120px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Feed preferences</h2>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              Refresh fetches only what you pick here.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex', padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {!catalog && !error && (
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Loading…</p>
          )}

          {catalog && (
            <>
              <Section
                title="Sources"
                count={`${sources.length}/${catalog.sources.length}`}
                onAll={() => setSources(catalog.sources.map(s => s.key))}
                onNone={() => setSources([])}
              >
                {catalog.sources.map(s => (
                  <Check
                    key={s.key}
                    label={s.label}
                    icon={<img src={`/icons/${s.key}.svg`} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                    checked={sources.includes(s.key)}
                    onToggle={() => setSources(prev =>
                      prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key],
                    )}
                  />
                ))}
              </Section>

              <Section
                title="Topics"
                count={`${topics.length}/${catalog.topics.length}`}
                onAll={() => setTopics([...catalog.topics])}
                onNone={() => setTopics([])}
              >
                {catalog.topics.map(t => (
                  <Check
                    key={t}
                    label={t}
                    checked={topics.includes(t)}
                    onToggle={() => setTopics(prev =>
                      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
                    )}
                  />
                ))}
              </Section>
            </>
          )}
        </div>

        <footer style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '11.5px', color: error ? '#ef4444' : 'var(--text-muted)' }}>
            {error ?? invalid ?? ' '}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={onClose} style={btn(false)}>Cancel</button>
            <button
              onClick={save}
              disabled={saving || !!invalid || !catalog}
              style={btn(true, saving || !!invalid || !catalog)}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function btn(primary: boolean, disabled = false): React.CSSProperties {
  return {
    background: primary ? 'var(--text)' : 'none',
    color: primary ? 'var(--bg)' : 'var(--text-secondary)',
    border: primary ? 'none' : '1px solid var(--border)',
    borderRadius: '6px', padding: '5px 13px', fontSize: '12.5px',
    fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function Section({
  title, count, onAll, onNone, children,
}: {
  title: string
  count: string
  onAll: () => void
  onNone: () => void
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px' }}>
        <h3 style={{
          fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0,
        }}>
          {title}
        </h3>
        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{count}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={onAll} style={linkBtn}>All</button>
          <button onClick={onNone} style={linkBtn}>None</button>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{children}</div>
    </section>
  )
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'inherit',
  textDecoration: 'underline',
}

function Check({
  label, icon, checked, onToggle,
}: {
  label: string
  icon?: React.ReactNode
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '9px',
      padding: '5px 7px', borderRadius: '5px', cursor: 'pointer',
      fontSize: '13px', color: checked ? 'var(--text)' : 'var(--text-secondary)',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--text)' }}
      />
      {icon}
      {label}
    </label>
  )
}
