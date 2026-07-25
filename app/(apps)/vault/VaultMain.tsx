'use client'

// Three-pane vault shell: left pane (placeholder quick-views — the real
// folder tree + type/tag filters land in Task 7), center (search + grid/list
// toggle + item grid), and the right-hand detail slide-over.
//
// Filter/selection state lives here so Task 7 (folder tree, type & tag
// filters) and Task 8 (add/edit editor, ⌘K search, generator) can extend
// this component without re-plumbing state: `selectedId`, `query`, and the
// as-yet-unused-by-UI `quickView` / `typeFilter` / `folderId` / `activeTag`.

import { useEffect, useMemo, useState } from 'react'
import { Search, LayoutGrid, List, Star, Inbox } from 'lucide-react'
import { useVault } from './VaultContext'
import ItemGrid from './ItemGrid'
import ItemDetail from './ItemDetail'
import { matchesQuery, descendantFolderIds } from '@/lib/vault'
import type { DecryptedItem, VaultItemType } from '@/lib/vault'

type QuickView = 'all' | 'favorites'
type ViewMode = 'grid' | 'list'

const sideRowStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 8px', borderRadius: '7px',
  fontSize: '13px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  fontWeight: active ? 600 : 400, cursor: 'pointer',
  background: active ? 'var(--accent-bg)' : 'transparent',
})

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', margin: '16px 8px 6px', fontWeight: 700,
}

export default function VaultMain() {
  const { items, folders } = useVault()

  // Selection.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filters — quickView/typeFilter/folderId/activeTag are seams for Task 7's
  // real sidebar (folder tree + type/tag chips); only quickView has a UI
  // control here (the placeholder list), the rest are wired into the filter
  // below but nothing sets them yet.
  const [query, setQuery] = useState('')
  const [quickView, setQuickView] = useState<QuickView>('all')
  const [typeFilter] = useState<VaultItemType | null>(null)
  const [folderId] = useState<string | null>(null)
  const [activeTag] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const visibleItems = useMemo(() => {
    let list: DecryptedItem[] = items
    if (quickView === 'favorites') list = list.filter(it => it.data.favorite)
    if (typeFilter) list = list.filter(it => it.data.type === typeFilter)
    if (folderId) {
      const ids = descendantFolderIds(folders, folderId)
      list = list.filter(it => it.data.folderId !== null && ids.has(it.data.folderId))
    }
    if (activeTag) list = list.filter(it => it.data.tags.includes(activeTag))
    if (query.trim()) list = list.filter(it => matchesQuery(it, query))
    return list
  }, [items, folders, quickView, typeFilter, folderId, activeTag, query])

  // Keep the detail panel from pointing at an item that just disappeared
  // (deleted, or filtered out from under the selection).
  useEffect(() => {
    if (selectedId && !items.some(it => it.id === selectedId)) setSelectedId(null)
  }, [items, selectedId])

  const selectedItem = selectedId ? items.find(it => it.id === selectedId) ?? null : null
  const favoriteCount = items.filter(it => it.data.favorite).length

  function handleAdd() {
    // Task 8 opens the add/edit editor here.
  }

  function handleEdit(_item: DecryptedItem) {
    // Task 8 opens the add/edit editor pre-filled with this item.
  }

  return (
    <div style={{
      display: 'flex', height: '100%', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
    }}>
      {/* LEFT PANE — placeholder; Task 7 replaces with the real folder tree + type/tag filters */}
      <div style={{
        width: '230px', flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--card-bg)', padding: '14px 10px', overflow: 'auto',
      }}>
        <div style={sideRowStyle(quickView === 'all')} onClick={() => setQuickView('all')}>
          <Inbox size={14} />
          <span>All items</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{items.length}</span>
        </div>
        <div style={sideRowStyle(quickView === 'favorites')} onClick={() => setQuickView('favorites')}>
          <Star size={14} />
          <span>Favorites</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{favoriteCount}</span>
        </div>

        <div style={sectionLabelStyle}>Folders</div>
        <div style={{ padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>Coming in Task 7</div>

        <div style={sectionLabelStyle}>Tags</div>
        <div style={{ padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>Coming in Task 7</div>
      </div>

      {/* CENTER */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {quickView === 'favorites' ? 'Favorites' : 'All items'}
          </h3>

          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', width: '230px',
            background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px',
          }}>
            <Search size={13} color="var(--text-muted)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search vault…"
              style={{
                border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0,
                fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: '10px', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 5px', color: 'var(--text-muted)' }}>
              ⌘K
            </span>
          </div>

          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              style={{
                display: 'flex', padding: '6px 8px', border: 'none', cursor: 'pointer',
                background: viewMode === 'grid' ? 'var(--accent-bg)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              style={{
                display: 'flex', padding: '6px 8px', border: 'none', cursor: 'pointer',
                background: viewMode === 'list' ? 'var(--accent-bg)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <List size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            style={{
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '12px',
              border: 'none', borderRadius: '8px', padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + Add
          </button>
        </div>

        <ItemGrid items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} viewMode={viewMode} />
      </div>

      {/* DETAIL SLIDE-OVER */}
      <ItemDetail item={selectedItem} onClose={() => setSelectedId(null)} onEdit={handleEdit} />
    </div>
  )
}
