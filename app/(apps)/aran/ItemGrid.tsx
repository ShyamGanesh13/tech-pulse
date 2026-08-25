'use client'

// Card grid (and compact list) of vault items. Each card shows a monogram
// avatar wrapped in an SVG "strength ring" (colored arc sized to the login
// password's strength; a plain neutral ring for other types), title,
// type-aware subtitle, type label, and a favorite star toggle.

import { Star } from 'lucide-react'
import { useVault } from './VaultContext'
import { initials, colorFor, TYPE_META } from './vault-ui'
import { passwordStrength } from '@/lib/vault'
import type { DecryptedItem, LoginFields, ApiKeyFields, BankFields } from '@/lib/vault'

const RING_R = 21
const RING_C = 2 * Math.PI * RING_R

function ringFor(item: DecryptedItem): { color: string; fraction: number } {
  if (item.data.type === 'login') {
    const { score, color } = passwordStrength((item.data.fields as LoginFields).password)
    return { color, fraction: (score + 1) / 5 }
  }
  return { color: 'var(--text-muted)', fraction: 1 }
}

function subtitleFor(item: DecryptedItem): string {
  const d = item.data
  if (d.type === 'login') return (d.fields as LoginFields).username || '—'
  if (d.type === 'apikey') return (d.fields as ApiKeyFields).endpoint || '—'
  if (d.type === 'bank') {
    const acct = (d.fields as BankFields).accountNumber || ''
    return acct.length > 4 ? `****${acct.slice(-4)}` : acct || '—'
  }
  return '—'
}

function StrengthRing({ item }: { item: DecryptedItem }) {
  const { color, fraction } = ringFor(item)
  const offset = RING_C * (1 - fraction)
  return (
    <svg viewBox="0 0 44 44" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <circle cx="22" cy="22" r={RING_R} fill="none" style={{ stroke: 'var(--border)' }} strokeWidth="2" />
      <circle
        cx="22" cy="22" r={RING_R} fill="none"
        style={{ stroke: color }}
        strokeWidth="2"
        strokeDasharray={RING_C}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
    </svg>
  )
}

function Avatar({ item }: { item: DecryptedItem }) {
  return (
    <div style={{ position: 'relative', width: '44px', height: '44px', flexShrink: 0 }}>
      <StrengthRing item={item} />
      <div style={{
        position: 'absolute', inset: '4px', borderRadius: '10px', background: colorFor(item.id),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 700, color: '#fff',
      }}>
        {initials(item.data.title)}
      </div>
    </div>
  )
}

interface ItemGridProps {
  items: DecryptedItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  viewMode: 'grid' | 'list'
}

export default function ItemGrid({ items, selectedId, onSelect, viewMode }: ItemGridProps) {
  const { updateItem } = useVault()

  function toggleFavorite(e: React.MouseEvent, item: DecryptedItem) {
    e.stopPropagation()
    updateItem(item.id, { ...item.data, favorite: !item.data.favorite })
  }

  if (items.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '13px',
      }}>
        No items to show.
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '16px',
      display: 'grid',
      gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(150px, 1fr))' : '1fr',
      gap: '12px',
      alignContent: 'start',
    }}>
      {items.map(item => {
        const selected = item.id === selectedId
        const isList = viewMode === 'list'
        return (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              background: 'var(--card-bg)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
              borderRadius: '10px', padding: '14px', position: 'relative', cursor: 'pointer',
              display: isList ? 'flex' : 'block', alignItems: isList ? 'center' : undefined, gap: isList ? '12px' : undefined,
            }}
          >
            <button
              onClick={e => toggleFavorite(e, item)}
              aria-label={item.data.favorite ? 'Remove from favorites' : 'Add to favorites'}
              style={{
                position: isList ? 'static' : 'absolute', top: '10px', right: '10px',
                marginLeft: isList ? 'auto' : undefined, order: isList ? 2 : undefined,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', color: item.data.favorite ? '#fbbf24' : 'var(--text-muted)',
              }}
            >
              <Star size={15} fill={item.data.favorite ? '#fbbf24' : 'none'} />
            </button>

            <div style={{ marginBottom: isList ? 0 : '10px' }}>
              <Avatar item={item} />
            </div>

            <div style={{ minWidth: 0, flex: isList ? 1 : undefined }}>
              <div style={{
                fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {item.data.title}
              </div>
              <div style={{
                fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {subtitleFor(item)}
              </div>
              <div style={{
                fontSize: '10px', color: 'var(--text-secondary)', marginTop: isList ? '2px' : '8px',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {TYPE_META[item.data.type].label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
