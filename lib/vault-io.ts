// Pure import/export helpers for the vault. No React, no crypto, no fetch —
// everything here operates on already-decrypted, in-memory data. The caller
// (ImportExport.tsx) is responsible for keeping plaintext client-side only:
// these functions just shape strings in and out.

import type { VaultItemData, DecryptedItem, DecryptedFolder, LoginFields } from '@/lib/vault'

export type MappableField = 'title' | 'username' | 'password' | 'url' | 'notes' | 'folder' | 'tags'

// ---------------------------------------------------------------------------
// Folder <-> path helpers ("Work/Cloud", '/'-joined, no surrounding spaces —
// distinct from `flattenFolders`' " / "-joined UI labels).
// ---------------------------------------------------------------------------

function folderPath(folders: DecryptedFolder[], folderId: string | null): string | null {
  if (folderId === null) return null
  const byId = new Map(folders.map(f => [f.id, f] as const))
  const parts: string[] = []
  let cur = byId.get(folderId)
  const seen = new Set<string>() // guard against a cyclic parentId chain
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.length ? parts.join('/') : null
}

function allFolderPaths(folders: DecryptedFolder[]): string[] {
  // Depth-first-ish; order matters so ancestors are listed before descendants,
  // which is convenient (though not required) for the importer to create
  // folders top-down.
  const byParent = new Map<string | null, DecryptedFolder[]>()
  for (const f of folders) {
    const key = f.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(f)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const out: string[] = []
  function walk(parentId: string | null, prefix: string) {
    for (const f of byParent.get(parentId) ?? []) {
      const path = prefix ? `${prefix}/${f.name}` : f.name
      out.push(path)
      walk(f.id, path)
    }
  }
  walk(null, '')
  return out
}

// ---------------------------------------------------------------------------
// JSON export / import
// ---------------------------------------------------------------------------

interface VaultExportItem extends VaultItemData {
  folderPath: string | null
}

interface VaultExportPayload {
  version: 1
  folders: { path: string }[]
  items: VaultExportItem[]
}

/** Canonical, unencrypted JSON export. Caller downloads the resulting string as a file. */
export function exportJSON(items: DecryptedItem[], folders: DecryptedFolder[]): string {
  const payload: VaultExportPayload = {
    version: 1,
    folders: allFolderPaths(folders).map(path => ({ path })),
    items: items.map((it): VaultExportItem => ({
      ...it.data,
      folderPath: folderPath(folders, it.data.folderId),
    })),
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Parses a previously-exported JSON file back into importable pieces. The
 * original `folderId` values are meaningless in a different vault, so each
 * returned item's `folderId` is re-expressed as the folder *path* (or null)
 * — the caller resolves/creates real folders by path (mirroring the CSV
 * import flow) and substitutes the real id before calling `createItem`.
 */
export function parseJsonImport(text: string): { items: VaultItemData[]; folders: { path: string }[] } {
  const parsed = JSON.parse(text) as Partial<VaultExportPayload>
  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const rawFolders = Array.isArray(parsed.folders) ? parsed.folders : []
  const items: VaultItemData[] = rawItems.map((raw) => {
    const { folderPath: path, ...rest } = raw
    return { ...(rest as VaultItemData), folderId: path ?? null }
  })
  const folders = rawFolders.map(f => ({ path: f.path }))
  return { items, folders }
}

// ---------------------------------------------------------------------------
// CSV export / parse
// ---------------------------------------------------------------------------

const CSV_HEADERS = ['title', 'username', 'password', 'url', 'folder', 'tags', 'notes'] as const

function csvQuote(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Flattens login items to a CSV. Non-login items (notes/bank/apikey) have no CSV column set and are skipped in v1. */
export function exportCsv(items: DecryptedItem[], folders: DecryptedFolder[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const it of items) {
    if (it.data.type !== 'login') continue
    const f = it.data.fields as LoginFields
    const cols = [
      it.data.title,
      f.username,
      f.password,
      f.url,
      folderPath(folders, it.data.folderId) ?? '',
      it.data.tags.join(';'),
      it.data.notes,
    ]
    lines.push(cols.map(csvQuote).join(','))
  }
  return lines.join('\n')
}

/** RFC4180-ish tokenizer: handles quoted fields containing commas, quotes (escaped as `""`), and embedded newlines. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i += 1; continue
      }
      field += ch; i += 1; continue
    }
    if (ch === '"') { inQuotes = true; i += 1; continue }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue }
    if (ch === '\r') { i += 1; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue }
    field += ch; i += 1
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const table = tokenizeCsv(text)
  const [headerRow, ...rest] = table
  return { headers: headerRow ?? [], rows: rest }
}

// ---------------------------------------------------------------------------
// Header auto-mapping + row -> item construction
// ---------------------------------------------------------------------------

const HEADER_SYNONYMS: Record<MappableField, string[]> = {
  title: ['title', 'name', 'password name', 'account'],
  username: ['username', 'user name', 'login', 'email'],
  password: ['password', 'pass'],
  url: ['url', 'website', 'link'],
  notes: ['notes', 'description', 'note'],
  folder: ['folder', 'category', 'group'],
  tags: ['tags', 'labels'],
}

const MAPPABLE_FIELDS = Object.keys(HEADER_SYNONYMS) as MappableField[]

export function autoMap(headers: string[]): Partial<Record<MappableField, number>> {
  const normalized = headers.map(h => h.trim().toLowerCase())
  const result: Partial<Record<MappableField, number>> = {}
  for (const field of MAPPABLE_FIELDS) {
    const idx = normalized.findIndex(h => HEADER_SYNONYMS[field].includes(h))
    if (idx !== -1) result[field] = idx
  }
  return result
}

/** Builds login items from mapped CSV rows. `folderPathToId` is expected to be a synchronous, pre-resolved lookup (async folder creation happens beforehand in the UI). */
export function rowsToItems(
  rows: string[][],
  map: Partial<Record<MappableField, number>>,
  folderPathToId: (path: string) => string,
): { data: VaultItemData }[] {
  const get = (row: string[], field: MappableField): string => {
    const idx = map[field]
    return idx !== undefined ? (row[idx] ?? '').trim() : ''
  }
  return rows
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map((row): { data: VaultItemData } => {
      const folder = get(row, 'folder')
      const tagsRaw = get(row, 'tags')
      const tags = tagsRaw ? tagsRaw.split(/[;,]/).map(t => t.trim()).filter(Boolean) : []
      const data: VaultItemData = {
        type: 'login',
        title: get(row, 'title'),
        favorite: false,
        folderId: folder ? folderPathToId(folder) : null,
        tags,
        notes: get(row, 'notes'),
        fields: { username: get(row, 'username'), password: get(row, 'password'), url: get(row, 'url') },
      }
      return { data }
    })
}
