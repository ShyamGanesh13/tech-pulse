'use client'

// Client-side-only import/export. Export decrypts nothing extra — `items`/
// `folders` from context are already the decrypted, in-memory plaintext — and
// serializes it straight to a downloadable file. Import parses a file the
// user picks, lets them map CSV columns (or accepts the canonical JSON
// export shape), then encrypts + creates each item/folder through the normal
// `useVault()` calls. Plaintext never touches the network except via those
// existing encrypted create calls; the exported file itself is unencrypted.

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, Loader2, Upload, X } from 'lucide-react'
import { useVault } from './VaultContext'
import {
  exportCsv, exportJSON, autoMap, parseCsv, parseJsonImport, rowsToItems,
  type MappableField,
} from '@/lib/vault-io'
import type { VaultItemData } from '@/lib/vault'

const PREVIEW_ROWS = 5

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: '12px', fontFamily: 'inherit',
  color: 'var(--text-primary)', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: '7px', padding: '6px 8px',
}

const buttonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)', borderRadius: '8px',
  padding: '8px 14px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer',
  background: 'none', fontFamily: 'inherit',
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700,
}

function download(filename: string, mimeType: string, contents: string) {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

const warningStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#b45309',
  background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)',
  borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', lineHeight: 1.5,
}

function UnencryptedWarning({ children }: { children: React.ReactNode }) {
  return (
    <div style={warningStyle}>
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{children}</span>
    </div>
  )
}

interface ImportExportProps {
  onClose: () => void
}

type Stage =
  | { kind: 'export' }
  | { kind: 'csv-map'; fileName: string; headers: string[]; rows: string[][]; map: Partial<Record<MappableField, number>> }
  | { kind: 'json-preview'; fileName: string; items: VaultItemData[]; folders: { path: string }[] }
  | { kind: 'importing' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string }

const MAP_FIELDS: { field: MappableField; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'username', label: 'Username' },
  { field: 'password', label: 'Password' },
  { field: 'url', label: 'URL' },
  { field: 'folder', label: 'Folder' },
  { field: 'tags', label: 'Tags' },
  { field: 'notes', label: 'Notes' },
]

export default function ImportExport({ onClose }: ImportExportProps) {
  const { items, folders, addFolder, createItem } = useVault()
  const [stage, setStage] = useState<Stage>({ kind: 'export' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportJSON = useCallback(() => {
    download(`vault-export-${todayStamp()}.json`, 'application/json', exportJSON(items, folders))
  }, [items, folders])

  const handleExportCsv = useCallback(() => {
    download(`vault-export-${todayStamp()}.csv`, 'text/csv', exportCsv(items, folders))
  }, [items, folders])

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text()
    const looksJson = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{')
    try {
      if (looksJson) {
        const { items: parsedItems, folders: parsedFolders } = parseJsonImport(text)
        setStage({ kind: 'json-preview', fileName: file.name, items: parsedItems, folders: parsedFolders })
      } else {
        const { headers, rows } = parseCsv(text)
        setStage({ kind: 'csv-map', fileName: file.name, headers, rows, map: autoMap(headers) })
      }
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Could not parse that file.' })
    }
  }, [])

  /** Resolves (creating as needed) every folder segment in `path`, returning the leaf folder's real id. */
  const resolveFolderPath = useCallback(async (path: string, cache: Map<string, string>): Promise<string> => {
    const segments = path.split('/').map(s => s.trim()).filter(Boolean)
    let parentId: string | null = null
    for (const name of segments) {
      const cacheKey = `${parentId ?? ''}::${name}`
      let id = cache.get(cacheKey)
      if (!id) {
        const existing = folders.find(f => f.parentId === parentId && f.name === name)
        if (existing) {
          id = existing.id
        } else {
          id = await addFolder(name, parentId)
        }
        cache.set(cacheKey, id)
      }
      parentId = id
    }
    return parentId ?? ''
  }, [addFolder, folders])

  const runImport = useCallback(async (dataList: VaultItemData[]) => {
    setStage({ kind: 'importing' })
    try {
      const cache = new Map<string, string>()
      const pathToId = new Map<string, string>()
      const uniquePaths = Array.from(new Set(
        dataList.map(d => d.folderId).filter((p): p is string => !!p),
      ))
      for (const path of uniquePaths) {
        pathToId.set(path, await resolveFolderPath(path, cache))
      }
      let count = 0
      for (const data of dataList) {
        const resolvedFolderId = data.folderId ? pathToId.get(data.folderId) ?? null : null
        await createItem({ ...data, folderId: resolvedFolderId })
        count += 1
      }
      setStage({ kind: 'done', count })
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Import failed.' })
    }
  }, [resolveFolderPath, createItem])

  const csvPreviewItems = useMemo(() => {
    if (stage.kind !== 'csv-map') return []
    return rowsToItems(stage.rows, stage.map, (path) => path).map(r => r.data)
  }, [stage])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '560px', maxWidth: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Import / Export</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px', maxHeight: '70vh', overflow: 'auto' }}>
          {stage.kind === 'export' && (
            <>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary)' }}>Export</h4>
              <UnencryptedWarning>
                This file is <strong>UNENCRYPTED</strong> plaintext — it contains your passwords and notes in the
                clear. Store it somewhere safe (or delete it right after use) and never send it over an insecure channel.
              </UnencryptedWarning>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button type="button" style={primaryButtonStyle} onClick={handleExportJSON}>
                  <Download size={13} /> Export JSON ({items.length} items)
                </button>
                <button type="button" style={buttonStyle} onClick={handleExportCsv}>
                  <Download size={13} /> Export CSV (logins only)
                </button>
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary)' }}>Import</h4>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Import is additive — it never overwrites or de-duplicates existing items. Accepts a JSON export from
                this app, or a CSV (e.g. exported from another password manager).
              </p>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> Choose file…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,text/csv,application/json"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              />
            </>
          )}

          {stage.kind === 'csv-map' && (
            <>
              <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-primary)' }}>Map columns — {stage.fileName}</h4>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {stage.rows.length} row{stage.rows.length === 1 ? '' : 's'} detected. Only logins are supported for CSV import.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', marginBottom: '16px' }}>
                {MAP_FIELDS.map(({ field, label }) => (
                  <div key={field} style={{ display: 'contents' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>{label}</label>
                    <select
                      value={stage.map[field] ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        setStage(s => s.kind === 'csv-map'
                          ? { ...s, map: { ...s.map, [field]: v === '' ? undefined : Number(v) } }
                          : s)
                      }}
                      style={inputStyle}
                    >
                      <option value="">— not mapped —</option>
                      {stage.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary)' }}>Preview</h4>
              <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      {['Title', 'Username', 'Folder', 'Tags'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreviewItems.slice(0, PREVIEW_ROWS).map((d, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{d.title}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{'username' in d.fields ? d.fields.username : ''}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{d.folderId ?? ''}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{d.tags.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreviewItems.length > PREVIEW_ROWS && (
                  <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    …and {csvPreviewItems.length - PREVIEW_ROWS} more
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" style={buttonStyle} onClick={() => setStage({ kind: 'export' })}>Back</button>
                <button
                  type="button"
                  style={primaryButtonStyle}
                  disabled={stage.map.title === undefined}
                  onClick={() => runImport(csvPreviewItems)}
                >
                  Import {csvPreviewItems.length} item{csvPreviewItems.length === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}

          {stage.kind === 'json-preview' && (
            <>
              <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-primary)' }}>Import — {stage.fileName}</h4>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {stage.items.length} item{stage.items.length === 1 ? '' : 's'} and {stage.folders.length} folder{stage.folders.length === 1 ? '' : 's'} found.
                Import is additive — existing items are left untouched.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" style={buttonStyle} onClick={() => setStage({ kind: 'export' })}>Back</button>
                <button type="button" style={primaryButtonStyle} onClick={() => runImport(stage.items)}>
                  Import {stage.items.length} item{stage.items.length === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}

          {stage.kind === 'importing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', padding: '20px 0' }}>
              <Loader2 size={16} style={{ animation: 'vault-io-spin 0.8s linear infinite' }} /> Importing…
              <style>{`@keyframes vault-io-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {stage.kind === 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', padding: '20px 0' }}>
              <Check size={16} color="#22c55e" /> Imported {stage.count} item{stage.count === 1 ? '' : 's'}.
            </div>
          )}

          {stage.kind === 'error' && (
            <>
              <UnencryptedWarning>{stage.message}</UnencryptedWarning>
              <button type="button" style={buttonStyle} onClick={() => setStage({ kind: 'export' })}>Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
