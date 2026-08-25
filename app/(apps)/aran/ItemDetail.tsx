'use client'

// Slide-over detail panel for the selected vault item. Renders type-aware
// field rows with per-field copy, a mask/reveal toggle + strength bar for
// password-like fields, a clickable URL, notes, and tag chips.
// No version history here — that's out of scope for Task 6.

import { useState } from 'react'
import { Pencil, X, Copy, Eye, EyeOff, Check } from 'lucide-react'
import { initials, colorFor, TYPE_META } from './vault-ui'
import { passwordStrength } from '@/lib/vault'
import { useCopy } from './useCopy'
import type { DecryptedItem, LoginFields, ApiKeyFields, BankFields } from '@/lib/vault'

type FieldKind = 'text' | 'secret' | 'url'
interface FieldRow { key: string; label: string; value: string; kind: FieldKind; strength?: boolean }

function fieldsFor(item: DecryptedItem): FieldRow[] {
  const d = item.data
  let rows: FieldRow[] = []
  if (d.type === 'login') {
    const f = d.fields as LoginFields
    rows = [
      { key: 'username', label: 'Username', value: f.username, kind: 'text' },
      { key: 'password', label: 'Password', value: f.password, kind: 'secret', strength: true },
      { key: 'url', label: 'URL', value: f.url, kind: 'url' },
    ]
  } else if (d.type === 'apikey') {
    const f = d.fields as ApiKeyFields
    rows = [
      { key: 'key', label: 'Key', value: f.key, kind: 'secret' },
      { key: 'secret', label: 'Secret', value: f.secret, kind: 'secret' },
      { key: 'endpoint', label: 'Endpoint', value: f.endpoint, kind: /^https?:\/\//.test(f.endpoint) ? 'url' : 'text' },
    ]
  } else if (d.type === 'bank') {
    const f = d.fields as BankFields
    rows = [
      { key: 'bankName', label: 'Bank', value: f.bankName, kind: 'text' },
      { key: 'accountNumber', label: 'Account number', value: f.accountNumber, kind: 'secret' },
      { key: 'ifsc', label: 'IFSC', value: f.ifsc, kind: 'text' },
      { key: 'holder', label: 'Holder', value: f.holder, kind: 'text' },
    ]
  }
  return rows.filter(r => r.value)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', color: 'var(--text-muted)',
}

interface FieldValueProps {
  row: FieldRow
  fieldId: string
  copy: (text: string, fieldKey: string) => void
  copiedField: string | null
  secondsLeft: number
}

// NOTE (Task-8 fix): this component is deliberately remounted per-item — see
// the `key={fieldId}` (`${item.id}:${row.key}`) on its wrapper below, instead
// of just `key={row.key}`. With only `row.key` as the key, switching between
// two same-type items (e.g. two logins) whose value at the same slot happens
// to be identical left this component mounted across the switch, so
// `revealed` (a local useState) kept its stale value instead of resetting —
// reveal state leaked from one item's password to the next. Keying on the
// item id too forces a fresh mount (and fresh `revealed` state) on every item
// change.
//
// `fieldId` (rather than bare `row.key`) is also what identifies this field
// to the shared `useCopy` instance in the parent: `copiedField` lives above
// the remount boundary, so scoping it to `${item.id}:${row.key}` stops a
// "copied" checkmark from spuriously reappearing on a different item that
// happens to have a field with the same key (e.g. both logins have a
// "password" row).
function FieldValue({ row, fieldId, copy, copiedField, secondsLeft }: FieldValueProps) {
  const [revealed, setRevealed] = useState(false)
  const copied = copiedField === fieldId

  function handleCopy() {
    copy(row.value, fieldId)
  }

  const displayValue = row.kind === 'secret' && !revealed ? '••••••••••••' : row.value

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
        {row.kind === 'url' ? (
          <a
            href={/^https?:\/\//.test(row.value) ? row.value : `https://${row.value}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}
          >
            {row.value}
          </a>
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {displayValue}
          </span>
        )}
        {row.kind === 'secret' && (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
            style={iconBtnStyle}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${row.label}`}
          style={{ ...iconBtnStyle, marginLeft: 'auto', gap: '4px', color: copied ? '#22c55e' : 'var(--text-muted)' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied && <span style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>{secondsLeft}s</span>}
        </button>
      </div>
      {row.strength && (
        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden', marginTop: '6px' }}>
          <div style={{
            height: '100%',
            width: `${((passwordStrength(row.value).score + 1) / 5) * 100}%`,
            background: passwordStrength(row.value).color,
          }} />
        </div>
      )}
    </div>
  )
}

interface ItemDetailProps {
  item: DecryptedItem | null
  onClose: () => void
  onEdit: (item: DecryptedItem) => void
}

export default function ItemDetail({ item, onClose, onEdit }: ItemDetailProps) {
  // Called unconditionally (rules of hooks) even though `item` may be null —
  // the early return below happens after this.
  const { copy, copiedField, secondsLeft } = useCopy()

  if (!item) return null
  const meta = TYPE_META[item.data.type]

  return (
    <div style={{
      width: '330px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--card-bg)',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px', background: colorFor(item.id), flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '13px',
        }}>
          {initials(item.data.title)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.data.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {meta.label} · updated {formatDate(item.updated_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button type="button" onClick={() => onEdit(item)} aria-label="Edit item" style={iconBtnStyle}>
            <Pencil size={16} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" style={iconBtnStyle}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {fieldsFor(item).map(row => {
          // Keyed on item id + field key (not just row.key) so switching
          // items always remounts FieldValue — see the fix note above.
          const fieldId = `${item.id}:${row.key}`
          return (
            <div key={fieldId}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                {row.label}
              </div>
              <FieldValue row={row} fieldId={fieldId} copy={copy} copiedField={copiedField} secondsLeft={secondsLeft} />
            </div>
          )
        })}

        {item.data.notes && (
          <div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '5px' }}>
              Notes
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {item.data.notes}
            </div>
          </div>
        )}

        {item.data.tags.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '5px' }}>
              Tags
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {item.data.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: '11px', padding: '3px 9px', borderRadius: '20px',
                  border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
