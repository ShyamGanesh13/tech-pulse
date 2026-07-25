'use client'

// Global ⌘K / Ctrl+K command palette: a search-and-jump overlay over the
// current (decrypted, in-memory) item list. Mounted once by VaultMain; it
// owns its own open/closed state and only needs `onSelect` to hand the chosen
// item id back up (VaultMain sets `selectedId` and opens the detail panel).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useVault } from './VaultContext'
import { matchesQuery } from '@/lib/vault'
import { initials, colorFor, TYPE_META } from './vault-ui'

const MAX_RESULTS = 30

interface CommandPaletteProps {
  onSelect: (id: string) => void
}

export default function CommandPalette({ onSelect }: CommandPaletteProps) {
  const { items } = useVault()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global shortcut — lives for the lifetime of this component (mounted once
  // by VaultMain), cleaned up on unmount.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlight(0)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  const results = useMemo(
    () => items.filter(it => matchesQuery(it, query)).slice(0, MAX_RESULTS),
    [items, query],
  )

  useEffect(() => { setHighlight(0) }, [query])

  function close() { setOpen(false) }

  function choose(id: string) {
    onSelect(id)
    close()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[highlight]
      if (item) choose(item.id)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
      }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '480px', maxWidth: '90vw', background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <Search size={15} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to item… (title, username, url, tag)"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: '10px', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 5px', color: 'var(--text-muted)' }}>
            Esc
          </span>
        </div>

        <div style={{ maxHeight: '340px', overflow: 'auto', padding: '6px' }}>
          {results.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              No matches.
            </div>
          )}
          {results.map((item, i) => (
            <div
              key={item.id}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px',
                cursor: 'pointer', background: i === highlight ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <div style={{
                width: '28px', height: '28px', borderRadius: '7px', background: colorFor(item.id), flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff',
              }}>
                {initials(item.data.title)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.data.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{TYPE_META[item.data.type].label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
