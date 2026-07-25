'use client'

// Real left pane for the vault: quick views (All / Favorites / Recently
// used / Trash), per-type counts, tag chips, and the nested folder tree
// (expand/collapse, inline rename, add sub-folder, delete-with-reassign,
// and drag-to-move guarded against creating a parent/child cycle).
//
// This component owns the whole 230px sidebar column — VaultMain just
// mounts it and supplies/consumes the filter state.

import { useMemo, useRef, useState } from 'react'
import {
  Inbox, Star, Clock, Trash2, ChevronRight, ChevronDown, Folder as FolderIcon, Plus, Pencil,
} from 'lucide-react'
import { useVault } from './VaultContext'
import { descendantFolderIds } from '@/lib/vault'
import { TYPE_META } from './vault-ui'
import type { DecryptedItem, DecryptedFolder, VaultItemType } from '@/lib/vault'

export type QuickView = 'all' | 'favorites' | 'recent' | 'trash'

const TYPE_ORDER: VaultItemType[] = ['login', 'note', 'bank', 'apikey']
const TYPE_PLURAL: Record<VaultItemType, string> = {
  login: 'Logins', note: 'Secure notes', bank: 'Bank accounts', apikey: 'API keys',
}

const rowStyle = (active: boolean, indent = 0, blocked = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', borderRadius: '7px',
  fontSize: '13px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontWeight: active ? 600 : 400, cursor: blocked ? 'not-allowed' : 'pointer',
  background: active ? 'var(--accent-bg)' : 'transparent',
  paddingLeft: `${8 + indent * 16}px`,
  opacity: blocked ? 0.4 : 1,
})

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', margin: '16px 8px 6px', fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
  display: 'flex', flexShrink: 0, color: 'var(--text-muted)',
}

const inlineInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, fontSize: '12px', background: 'var(--bg)', color: 'var(--text-primary)',
  border: '1px solid var(--accent)', borderRadius: '4px', padding: '3px 6px', fontFamily: 'inherit',
}

interface FolderTreeProps {
  quickView: QuickView
  onQuickView: (v: QuickView) => void
  typeFilter: VaultItemType | null
  onType: (t: VaultItemType | null) => void
  folderId: string | null
  onFolder: (id: string | null) => void
  activeTag: string | null
  onTag: (t: string | null) => void
  items: DecryptedItem[]
}

interface TreeNode extends DecryptedFolder { children: TreeNode[] }

/** Groups the flat `folders` array by parentId into a nested tree (roots = parentId === null). */
function buildTree(folders: DecryptedFolder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const f of folders) byId.set(f.id, { ...f, children: [] })
  const roots: TreeNode[] = []
  for (const f of folders) {
    const node = byId.get(f.id)!
    const parent = f.parentId ? byId.get(f.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    nodes.forEach(n => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

export default function FolderTree({
  quickView, onQuickView, typeFilter, onType, folderId, onFolder, activeTag, onTag, items,
}: FolderTreeProps) {
  const { folders, addFolder, renameFolder, moveFolder, deleteFolder, updateItem } = useVault()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // null = no add-box open; 'ROOT' = new top-level folder; otherwise the parent folder id.
  const [addingParentId, setAddingParentId] = useState<string | 'ROOT' | null>(null)
  const [addValue, setAddValue] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Guards against the rename/add input's onBlur committing a stale value:
  // pressing Escape unmounts the focused input, which fires a native blur
  // that would otherwise re-run the commit with the (about-to-be-cleared)
  // typed value. Set true by the cancel handlers, checked at the top of the
  // corresponding commit function, and reset when a new edit/add starts.
  const suppressRenameCommitRef = useRef(false)
  const suppressAddCommitRef = useRef(false)

  const tree = useMemo(() => buildTree(folders), [folders])

  const favoriteCount = useMemo(() => items.filter(it => it.data.favorite).length, [items])

  const typeCounts = useMemo(() => {
    const counts: Record<VaultItemType, number> = { login: 0, note: 0, bank: 0, apikey: 0 }
    for (const it of items) counts[it.data.type]++
    return counts
  }, [items])

  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of items) {
      if (it.data.folderId) counts.set(it.data.folderId, (counts.get(it.data.folderId) ?? 0) + 1)
    }
    return counts
  }, [items])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) for (const t of it.data.tags) set.add(t)
    return Array.from(set).sort()
  }, [items])

  // Cycle guard: while dragging folder `draggingId`, no folder in its own
  // descendant set (which includes itself) is a legal drop target — there is
  // no server-side ancestry check, so this must be enforced client-side.
  const disallowed = useMemo(
    () => (draggingId ? descendantFolderIds(folders, draggingId) : new Set<string>()),
    [draggingId, folders],
  )

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectFolder(id: string) {
    onFolder(folderId === id ? null : id)
  }

  function startRename(f: DecryptedFolder) {
    suppressRenameCommitRef.current = false
    setEditingId(f.id)
    setEditValue(f.name)
  }

  async function commitRename() {
    if (suppressRenameCommitRef.current) return
    suppressRenameCommitRef.current = true
    const id = editingId
    const name = editValue.trim()
    setEditingId(null)
    if (!id || !name) return
    await renameFolder(id, name)
  }

  function cancelRename() {
    suppressRenameCommitRef.current = true
    setEditingId(null)
  }

  function startAdd(parentId: string | 'ROOT') {
    suppressAddCommitRef.current = false
    setAddingParentId(parentId)
    setAddValue('')
  }

  async function commitAdd() {
    if (suppressAddCommitRef.current) return
    suppressAddCommitRef.current = true
    const parentId = addingParentId
    const name = addValue.trim()
    setAddingParentId(null)
    if (!name || parentId === null) return
    const resolvedParent = parentId === 'ROOT' ? null : parentId
    await addFolder(name, resolvedParent)
    if (resolvedParent) setExpanded(prev => new Set(prev).add(resolvedParent))
  }

  function cancelAdd() {
    suppressAddCommitRef.current = true
    setAddingParentId(null)
  }

  // Per spec: deleting a folder reassigns its direct child folders AND its
  // direct items up to the deleted folder's own parent (or root) BEFORE the
  // folder itself is soft-deleted, so nothing is left orphaned pointing at a
  // deleted folder id.
  async function handleDelete(f: DecryptedFolder) {
    if (!window.confirm(`Delete folder "${f.name}"? Its sub-folders and items move up to the parent folder.`)) return
    const newParent = f.parentId
    const childFolders = folders.filter(c => c.parentId === f.id)
    const childItems = items.filter(it => it.data.folderId === f.id)
    await Promise.all([
      ...childFolders.map(c => moveFolder(c.id, newParent)),
      ...childItems.map(it => updateItem(it.id, { ...it.data, folderId: newParent })),
    ])
    await deleteFolder(f.id)
    if (folderId === f.id) onFolder(null)
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragEnd() { setDraggingId(null) }

  function isBlockedTarget(targetId: string | null): boolean {
    if (!draggingId) return false
    if (targetId === draggingId) return true
    if (targetId !== null && disallowed.has(targetId)) return true
    return false
  }

  function handleDragOver(e: React.DragEvent, targetId: string | null) {
    if (!draggingId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = isBlockedTarget(targetId) ? 'none' : 'move'
  }

  async function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    const id = draggingId
    setDraggingId(null)
    if (!id) return
    if (isBlockedTarget(targetId)) return // refuse: would create a cycle, or a no-op drop on itself
    const current = folders.find(f => f.id === id)
    if (current && current.parentId === targetId) return // already there
    await moveFolder(id, targetId)
  }

  function renderFolder(node: TreeNode, depth: number) {
    const isExpanded = expanded.has(node.id)
    const hasChildren = node.children.length > 0
    const isEditing = editingId === node.id
    const blocked = isBlockedTarget(node.id)
    const count = folderItemCounts.get(node.id) ?? 0

    return (
      <div key={node.id}>
        <div
          draggable={!isEditing}
          onDragStart={e => handleDragStart(e, node.id)}
          onDragEnd={handleDragEnd}
          onDragOver={e => { e.stopPropagation(); handleDragOver(e, node.id) }}
          onDrop={e => { e.stopPropagation(); handleDrop(e, node.id) }}
          style={rowStyle(folderId === node.id, depth, blocked)}
          onClick={() => !isEditing && !blocked && selectFolder(node.id)}
        >
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggleExpand(node.id) }}
            style={{ ...iconBtnStyle, visibility: hasChildren ? 'visible' : 'hidden', width: '12px' }}
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          <FolderIcon size={14} />
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename() }}
              onBlur={commitRename}
              style={inlineInputStyle}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.name}
            </span>
          )}
          {!isEditing && (
            <>
              {count > 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{count}</span>}
              <button type="button" style={iconBtnStyle} aria-label="Add sub-folder"
                onClick={e => { e.stopPropagation(); startAdd(node.id) }}>
                <Plus size={12} />
              </button>
              <button type="button" style={iconBtnStyle} aria-label="Rename folder"
                onClick={e => { e.stopPropagation(); startRename(node) }}>
                <Pencil size={12} />
              </button>
              <button type="button" style={iconBtnStyle} aria-label="Delete folder"
                onClick={e => { e.stopPropagation(); handleDelete(node) }}>
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>

        {addingParentId === node.id && (
          <div style={{ padding: '2px 8px', paddingLeft: `${8 + (depth + 1) * 16}px`, display: 'flex' }}>
            <input
              autoFocus
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              placeholder="Folder name"
              onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') cancelAdd() }}
              onBlur={commitAdd}
              style={inlineInputStyle}
            />
          </div>
        )}

        {isExpanded && node.children.map(child => renderFolder(child, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{
      width: '230px', flexShrink: 0, borderRight: '1px solid var(--border)',
      background: 'var(--card-bg)', padding: '14px 10px', overflow: 'auto',
    }}>
      <div style={rowStyle(quickView === 'all')} onClick={() => onQuickView('all')}>
        <Inbox size={14} />
        <span>All items</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{items.length}</span>
      </div>
      <div style={rowStyle(quickView === 'favorites')} onClick={() => onQuickView('favorites')}>
        <Star size={14} />
        <span>Favorites</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{favoriteCount}</span>
      </div>
      <div style={rowStyle(quickView === 'recent')} onClick={() => onQuickView('recent')}>
        <Clock size={14} />
        <span>Recently used</span>
      </div>
      <div style={rowStyle(quickView === 'trash')} onClick={() => onQuickView('trash')}>
        <Trash2 size={14} />
        <span>Trash</span>
      </div>

      <div style={sectionLabelStyle}><span>Types</span></div>
      {TYPE_ORDER.map(t => {
        const Icon = TYPE_META[t].icon
        return (
          <div key={t} style={rowStyle(typeFilter === t)} onClick={() => onType(typeFilter === t ? null : t)}>
            <Icon size={14} />
            <span>{TYPE_PLURAL[t]}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{typeCounts[t]}</span>
          </div>
        )
      })}

      <div style={sectionLabelStyle}>
        <span>Folders</span>
        <button type="button" style={iconBtnStyle} aria-label="New folder" onClick={() => startAdd('ROOT')}>
          <Plus size={12} />
        </button>
      </div>
      <div onDragOver={e => handleDragOver(e, null)} onDrop={e => handleDrop(e, null)}>
        {addingParentId === 'ROOT' && (
          <div style={{ padding: '2px 8px', display: 'flex' }}>
            <input
              autoFocus
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              placeholder="Folder name"
              onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') cancelAdd() }}
              onBlur={commitAdd}
              style={inlineInputStyle}
            />
          </div>
        )}
        {tree.length === 0 && addingParentId !== 'ROOT' && (
          <div style={{ padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>No folders yet</div>
        )}
        {tree.map(node => renderFolder(node, 0))}
      </div>

      <div style={sectionLabelStyle}><span>Tags</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '2px 8px' }}>
        {allTags.length === 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No tags yet</span>
        )}
        {allTags.map(tag => (
          <span
            key={tag}
            onClick={() => onTag(activeTag === tag ? null : tag)}
            style={{
              fontSize: '11px', padding: '3px 9px', borderRadius: '20px', cursor: 'pointer',
              border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border)'}`,
              color: activeTag === tag ? 'var(--accent)' : 'var(--text-secondary)',
              background: activeTag === tag ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
