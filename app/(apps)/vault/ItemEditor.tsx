'use client'

// Create/edit form for a vault item. A type <select> swaps the rendered field
// set (login/note/bank/apikey); a folder <select> (flattened tree → indented
// path labels) and a tag-chips input apply to every type. The login type gets
// an inline password generator popover with a live strength bar.
//
// Rendered as a centered modal overlay by VaultMain, in both create mode
// (`item` is null) and edit mode (`item` is the item being edited).

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Dices, Eye, EyeOff } from 'lucide-react'
import { useVault } from './VaultContext'
import {
  generatePassword, passwordStrength, flattenFolders, buildItemData,
} from '@/lib/vault'
import type {
  DecryptedItem, VaultItemType, LoginFields, BankFields, ApiKeyFields, EditorFormState,
} from '@/lib/vault'

const TYPE_OPTIONS: { value: VaultItemType; label: string }[] = [
  { value: 'login', label: 'Login' },
  { value: 'note', label: 'Secure note' },
  { value: 'bank', label: 'Bank account' },
  { value: 'apikey', label: 'API key' },
]

const labelStyle: React.CSSProperties = {
  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--text-muted)', marginBottom: '5px', display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: '13px', fontFamily: 'inherit',
  color: 'var(--text-primary)', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '8px 10px',
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: '14px' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={fieldWrapStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

interface GeneratorPopoverProps {
  onUse: (pw: string) => void
  onClose: () => void
}

function GeneratorPopover({ onUse, onClose }: GeneratorPopoverProps) {
  const [length, setLength] = useState(20)
  const [upper, setUpper] = useState(true)
  const [lower, setLower] = useState(true)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(true)
  const [preview, setPreview] = useState(() => generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true }))
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [onClose])

  function regenerate(opts?: Partial<{ length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean }>) {
    const next = {
      length: opts?.length ?? length,
      upper: opts?.upper ?? upper,
      lower: opts?.lower ?? lower,
      digits: opts?.digits ?? digits,
      symbols: opts?.symbols ?? symbols,
    }
    setPreview(generatePassword(next))
  }

  const strength = passwordStrength(preview)

  const toggle = (key: 'upper' | 'lower' | 'digits' | 'symbols', value: boolean, setter: (v: boolean) => void) => {
    setter(value)
    regenerate({ [key]: value })
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, width: '260px',
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Generate password</span>
        <button type="button" onClick={onClose} aria-label="Close generator" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>

      <div
        style={{
          fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-primary)',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', marginBottom: '8px',
        }}
      >
        {preview}
      </div>

      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${((strength.score + 1) / 5) * 100}%`, background: strength.color }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <input
          type="range" min={8} max={64} value={length}
          onChange={e => { const v = Number(e.target.value); setLength(v); regenerate({ length: v }) }}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '24px', textAlign: 'right' }}>{length}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
        {([
          ['upper', 'A-Z', upper, setUpper],
          ['lower', 'a-z', lower, setLower],
          ['digits', '0-9', digits, setDigits],
          ['symbols', '!@#', symbols, setSymbols],
        ] as const).map(([key, label, value, setter]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={value} onChange={e => toggle(key, e.target.checked, setter)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => regenerate()}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            border: '1px solid var(--border)', borderRadius: '7px', padding: '7px', background: 'none',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Dices size={13} /> Regenerate
        </button>
        <button
          type="button"
          onClick={() => onUse(preview)}
          style={{
            flex: 1, border: 'none', borderRadius: '7px', padding: '7px', background: 'var(--accent)',
            color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Use
        </button>
      </div>
    </div>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    if (tags.includes(tag)) { setDraft(''); return }
    onChange([...tags, tag])
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div
      style={{
        ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minHeight: '20px',
      }}
    >
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 4px 2px 9px',
            borderRadius: '20px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)',
          }}
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter(t => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--accent)', padding: '2px' }}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        style={{ flex: 1, minWidth: '60px', border: 'none', outline: 'none', background: 'transparent', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
      />
    </div>
  )
}

interface ItemEditorProps {
  item: DecryptedItem | null
  defaultFolderId?: string | null
  onClose: () => void
}

export default function ItemEditor({ item, defaultFolderId = null, onClose }: ItemEditorProps) {
  const { createItem, updateItem, folders } = useVault()
  const isEdit = item !== null

  const [type, setType] = useState<VaultItemType>(item?.data.type ?? 'login')
  const [title, setTitle] = useState(item?.data.title ?? '')
  const [folderId, setFolderId] = useState<string | null>(item?.data.folderId ?? defaultFolderId)
  const [tags, setTags] = useState<string[]>(item?.data.tags ?? [])
  const [notes, setNotes] = useState(item?.data.notes ?? '')

  const [login, setLogin] = useState<LoginFields>(() =>
    item?.data.type === 'login' ? (item.data.fields as LoginFields) : { username: '', password: '', url: '' })
  const [bank, setBank] = useState<BankFields>(() =>
    item?.data.type === 'bank' ? (item.data.fields as BankFields) : { bankName: '', accountNumber: '', ifsc: '', holder: '' })
  const [apikey, setApikey] = useState<ApiKeyFields>(() =>
    item?.data.type === 'apikey' ? (item.data.fields as ApiKeyFields) : { key: '', secret: '', endpoint: '' })

  const [showGenerator, setShowGenerator] = useState(false)
  const [revealPassword, setRevealPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const generatorAnchorRef = useRef<HTMLDivElement>(null)

  const folderOptions = useMemo(() => flattenFolders(folders), [folders])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const form: EditorFormState = { type, title, folderId, tags, notes, login, bank, apikey }
      const data = buildItemData(form, item?.data.favorite ?? false)
      if (item) await updateItem(item.id, data)
      else await createItem(data)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  const strength = type === 'login' ? passwordStrength(login.password) : null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflow: 'auto',
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          width: '420px', maxWidth: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit item' : 'Add item'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px', maxHeight: '65vh', overflow: 'auto' }}>
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value as VaultItemType)} style={inputStyle} disabled={isEdit}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} required autoFocus />
          </Field>

          {type === 'login' && (
            <>
              <Field label="URL">
                <input value={login.url} onChange={e => setLogin({ ...login, url: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Username">
                <input value={login.username} onChange={e => setLogin({ ...login, username: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ ...fieldWrapStyle, position: 'relative' }} ref={generatorAnchorRef}>
                <label style={labelStyle}>Password</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type={revealPassword ? 'text' : 'password'}
                    value={login.password}
                    onChange={e => setLogin({ ...login, password: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealPassword(v => !v)}
                    aria-label={revealPassword ? 'Hide password' : 'Reveal password'}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 9px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  >
                    {revealPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGenerator(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid var(--border)', borderRadius: '8px',
                      padding: '0 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', background: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    <Dices size={13} /> Generate
                  </button>
                </div>
                {strength && login.password && (
                  <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden', marginTop: '6px' }}>
                    <div style={{ height: '100%', width: `${((strength.score + 1) / 5) * 100}%`, background: strength.color }} />
                  </div>
                )}
                {showGenerator && (
                  <GeneratorPopover
                    onUse={pw => { setLogin({ ...login, password: pw }); setRevealPassword(true); setShowGenerator(false) }}
                    onClose={() => setShowGenerator(false)}
                  />
                )}
              </div>
            </>
          )}

          {type === 'bank' && (
            <>
              <Field label="Bank name">
                <input value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Account number">
                <input value={bank.accountNumber} onChange={e => setBank({ ...bank, accountNumber: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="IFSC">
                <input value={bank.ifsc} onChange={e => setBank({ ...bank, ifsc: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Holder">
                <input value={bank.holder} onChange={e => setBank({ ...bank, holder: e.target.value })} style={inputStyle} />
              </Field>
            </>
          )}

          {type === 'apikey' && (
            <>
              <Field label="Key">
                <input value={apikey.key} onChange={e => setApikey({ ...apikey, key: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Secret">
                <input value={apikey.secret} onChange={e => setApikey({ ...apikey, secret: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Endpoint">
                <input value={apikey.endpoint} onChange={e => setApikey({ ...apikey, endpoint: e.target.value })} style={inputStyle} />
              </Field>
            </>
          )}

          <Field label="Folder">
            <select value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)} style={inputStyle}>
              <option value="">No folder</option>
              {folderOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>

          <Field label="Tags">
            <TagInput tags={tags} onChange={setTags} />
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          {saveError && (
            <span style={{ fontSize: '12px', color: 'var(--danger, #e5484d)', marginRight: 'auto' }}>
              Couldn&rsquo;t save — {saveError}. Try again.
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            style={{
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '12px', border: 'none',
              borderRadius: '8px', padding: '8px 16px', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: saving || !title.trim() ? 0.6 : 1,
            }}
          >
            {isEdit ? 'Save' : 'Add item'}
          </button>
        </div>
      </form>
    </div>
  )
}
