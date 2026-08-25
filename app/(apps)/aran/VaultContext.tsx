'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  deriveKek, generateDek, wrapDek, unwrapDek, encryptJSON, decryptJSON,
  randomBytes, toB64, fromB64, DEFAULT_ITERATIONS,
} from '@/lib/vault-crypto'
import type { VaultItemData, DecryptedItem, DecryptedFolder } from '@/lib/vault'
import { newId } from '@/lib/vault'

export type VaultStatus = 'loading' | 'setup' | 'locked' | 'unlocked'

interface StatusResponse {
  initialized: boolean
  kdf_salt?: string
  kdf_iterations?: number
  wrapped_dek?: string
}

interface ItemRow { id: string; iv: string; ciphertext: string; created_at: string; updated_at: string }
interface FolderRow { id: string; parent_id: string | null; iv: string; name_ct: string; sort_order: number }

// fetch() only rejects on network failure, not on HTTP 4xx/5xx — without this guard
// a server error would silently desync in-memory state from server truth.
function assertOk(res: Response, op: string) {
  if (!res.ok) throw new Error(`vault ${op} failed: ${res.status}`)
}

interface VaultContextValue {
  status: VaultStatus
  items: DecryptedItem[]
  folders: DecryptedFolder[]
  setup: (master: string) => Promise<void>
  unlock: (master: string) => Promise<void>
  lock: () => void
  createItem: (data: VaultItemData) => Promise<void>
  updateItem: (id: string, data: VaultItemData) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  restoreItem: (id: string) => Promise<void>
  loadTrash: () => Promise<DecryptedItem[]>
  purgeItem: (id: string) => Promise<void>
  addFolder: (name: string, parentId?: string | null, sortOrder?: number) => Promise<string>
  renameFolder: (id: string, name: string) => Promise<void>
  moveFolder: (id: string, parentId: string | null) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  changePassword: (newMaster: string) => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used within a VaultProvider')
  return ctx
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [items, setItems] = useState<DecryptedItem[]>([])
  const [folders, setFolders] = useState<DecryptedFolder[]>([])
  // The DEK never leaves memory: not localStorage, not sessionStorage, not cookies.
  // A ref (rather than state) keeps CRUD helpers reading the latest key without
  // stale closures; `status` transitions already drive re-renders on lock/unlock.
  const dekRef = useRef<CryptoKey | null>(null)
  const setDek = useCallback((k: CryptoKey | null) => { dekRef.current = k }, [])

  const loadAll = useCallback(async (dek: CryptoKey) => {
    const res = await fetch('/api/aran/items')
    assertOk(res, 'loadAll')
    const data: { items: ItemRow[]; folders: FolderRow[] } = await res.json()
    const decItems = await Promise.all(data.items.map(async (row): Promise<DecryptedItem> => ({
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: await decryptJSON<VaultItemData>(row.iv, row.ciphertext, dek),
    })))
    const decFolders = await Promise.all(data.folders.map(async (row): Promise<DecryptedFolder> => ({
      id: row.id,
      parentId: row.parent_id,
      name: await decryptJSON<string>(row.iv, row.name_ct, dek),
      sortOrder: row.sort_order,
    })))
    setItems(decItems)
    setFolders(decFolders)
    setStatus('unlocked')
  }, [])

  const bootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/aran/status')
      const data: StatusResponse = await res.json()
      setStatus(data.initialized ? 'locked' : 'setup')
    } catch {
      setStatus('locked')
    }
  }, [])

  useEffect(() => { bootstrap() }, [bootstrap])

  const setup = useCallback(async (master: string) => {
    const salt = randomBytes(16)
    const kek = await deriveKek(master, salt, DEFAULT_ITERATIONS)
    const dek = await generateDek()
    const wrapped = await wrapDek(dek, kek)
    const res = await fetch('/api/aran/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kdf_salt: toB64(salt), kdf_iterations: DEFAULT_ITERATIONS, wrapped_dek: wrapped }),
    })
    assertOk(res, 'setup')
    setDek(dek)
    await loadAll(dek)
  }, [loadAll, setDek])

  const unlock = useCallback(async (master: string) => {
    const res = await fetch('/api/aran/status')
    assertOk(res, 'unlock status')
    const data: StatusResponse = await res.json()
    if (!data.initialized || !data.kdf_salt || !data.kdf_iterations || !data.wrapped_dek) {
      setStatus('setup')
      return
    }
    const kek = await deriveKek(master, fromB64(data.kdf_salt), data.kdf_iterations)
    let dek: CryptoKey
    try {
      dek = await unwrapDek(data.wrapped_dek, kek)
    } catch {
      throw new Error('Wrong master password')
    }
    setDek(dek)
    await loadAll(dek)
  }, [loadAll, setDek])

  const lock = useCallback(() => {
    setDek(null)
    setItems([])
    setFolders([])
    setStatus('locked')
  }, [setDek])

  const requireDek = useCallback((): CryptoKey => {
    if (!dekRef.current) throw new Error('Vault is locked')
    return dekRef.current
  }, [])

  const createItem = useCallback(async (data: VaultItemData) => {
    const dek = requireDek()
    const id = newId()
    const { iv, ciphertext } = await encryptJSON(data, dek)
    const res = await fetch('/api/aran/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, iv, ciphertext }),
    })
    assertOk(res, 'createItem')
    const row: ItemRow = await res.json()
    setItems(prev => [...prev, { id, created_at: row.created_at, updated_at: row.updated_at, data }])
  }, [requireDek])

  const updateItem = useCallback(async (id: string, data: VaultItemData) => {
    const dek = requireDek()
    const { iv, ciphertext } = await encryptJSON(data, dek)
    const res = await fetch(`/api/aran/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iv, ciphertext }),
    })
    assertOk(res, 'updateItem')
    setItems(prev => prev.map(it => it.id === id ? { ...it, data, updated_at: new Date().toISOString() } : it))
  }, [requireDek])

  const deleteItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/aran/items/${id}`, { method: 'DELETE' })
    assertOk(res, 'deleteItem')
    setItems(prev => prev.filter(it => it.id !== id))
  }, [])

  const restoreItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/aran/items/${id}?restore=1`, { method: 'DELETE' })
    assertOk(res, 'restoreItem')
    const dek = requireDek()
    await loadAll(dek)
  }, [requireDek, loadAll])

  // Trash rows never touch `items` state — they're a separate, on-demand
  // view (loaded when the Trash quick-view is selected) so the main list
  // never has to filter deleted rows back out.
  const loadTrash = useCallback(async (): Promise<DecryptedItem[]> => {
    const dek = requireDek()
    const res = await fetch('/api/aran/items?trash=1')
    assertOk(res, 'loadTrash')
    const data: { items: ItemRow[] } = await res.json()
    return Promise.all(data.items.map(async (row): Promise<DecryptedItem> => ({
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: await decryptJSON<VaultItemData>(row.iv, row.ciphertext, dek),
    })))
  }, [requireDek])

  const purgeItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/aran/items/${id}?hard=1`, { method: 'DELETE' })
    assertOk(res, 'purgeItem')
  }, [])

  const addFolder = useCallback(async (name: string, parentId: string | null = null, sortOrder = 0) => {
    const dek = requireDek()
    const id = newId()
    const { iv, ciphertext } = await encryptJSON(name, dek)
    const res = await fetch('/api/aran/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, parent_id: parentId, iv, name_ct: ciphertext, sort_order: sortOrder }),
    })
    assertOk(res, 'addFolder')
    setFolders(prev => [...prev, { id, parentId, name, sortOrder }])
    return id
  }, [requireDek])

  const renameFolder = useCallback(async (id: string, name: string) => {
    const dek = requireDek()
    const { iv, ciphertext } = await encryptJSON(name, dek)
    const res = await fetch(`/api/aran/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iv, name_ct: ciphertext }),
    })
    assertOk(res, 'renameFolder')
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
  }, [requireDek])

  const moveFolder = useCallback(async (id: string, parentId: string | null) => {
    const res = await fetch(`/api/aran/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId }),
    })
    assertOk(res, 'moveFolder')
    setFolders(prev => prev.map(f => f.id === id ? { ...f, parentId } : f))
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    const res = await fetch(`/api/aran/folders/${id}`, { method: 'DELETE' })
    assertOk(res, 'deleteFolder')
    setFolders(prev => prev.filter(f => f.id !== id))
  }, [])

  const changePassword = useCallback(async (newMaster: string) => {
    const dek = requireDek()
    const salt = randomBytes(16)
    const kek = await deriveKek(newMaster, salt, DEFAULT_ITERATIONS)
    const wrapped = await wrapDek(dek, kek)
    const res = await fetch('/api/aran/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kdf_salt: toB64(salt), kdf_iterations: DEFAULT_ITERATIONS, wrapped_dek: wrapped }),
    })
    assertOk(res, 'changePassword')
  }, [requireDek])

  const value: VaultContextValue = {
    status, items, folders,
    setup, unlock, lock,
    createItem, updateItem, deleteItem, restoreItem, loadTrash, purgeItem,
    addFolder, renameFolder, moveFolder, deleteFolder,
    changePassword,
  }

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
