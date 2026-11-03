'use client'

// Three-pane vault shell: left pane (the real folder tree + type/tag/quick-view
// filters, built in Task 7 as FolderTree), center (search + grid/list toggle +
// item grid, or the Trash list when that quick view is active), and the
// right-hand detail slide-over.

import { useEffect, useMemo, useState } from 'react'
import { Search, LayoutGrid, List, RotateCcw, XCircle, ArrowLeftRight, Menu } from 'lucide-react'
import { useVault } from './VaultContext'
import FolderTree, { type QuickView } from './FolderTree'
import ItemGrid from './ItemGrid'
import ItemDetail from './ItemDetail'
import ItemEditor from './ItemEditor'
import CommandPalette from './CommandPalette'
import ImportExport from './ImportExport'
import { matchesQuery, descendantFolderIds } from '@/lib/vault'
import { initials, colorFor, TYPE_META } from './vault-ui'
import type { DecryptedItem, VaultItemType } from '@/lib/vault'

// null = editor closed; otherwise the item being edited, or 'new' for create mode.
type EditorTarget = DecryptedItem | 'new' | null

type ViewMode = 'grid' | 'list'
const RECENT_LIMIT = 20

function TrashRow({ item, onRestore, onPurge }: {
  item: DecryptedItem
  onRestore: (id: string) => void
  onPurge: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 15px',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--card-bg)',
      boxShadow: 'var(--sh-1)',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', background: colorFor(item.id), flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '12px',
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
      <button
        type="button"
        onClick={() => onRestore(item.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px', background: 'none', cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: '7px', padding: '5px 9px',
          fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'inherit',
        }}
      >
        <RotateCcw size={12} /> Restore
      </button>
      <button
        type="button"
        onClick={() => { if (window.confirm(`Permanently delete "${item.data.title}"? This cannot be undone.`)) onPurge(item.id) }}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px', background: 'none', cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: '7px', padding: '5px 9px',
          fontSize: '12px', color: '#ef4444', fontFamily: 'inherit',
        }}
      >
        <XCircle size={12} /> Delete forever
      </button>
    </div>
  )
}

export default function VaultMain() {
  const { items, folders, restoreItem, purgeItem, loadTrash } = useVault()

  // Selection.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filters — all real state now, set from the FolderTree sidebar.
  const [query, setQuery] = useState('')
  const [quickView, setQuickView] = useState<QuickView>('all')
  const [typeFilter, setTypeFilter] = useState<VaultItemType | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Add/edit editor overlay.
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null)

  // Import/export overlay.
  const [importExportOpen, setImportExportOpen] = useState(false)

  // Mobile only (≤640px): the folder-tree sidebar collapses to an off-canvas
  // drawer toggled from the header. Always false / irrelevant on desktop,
  // where the toggle button and backdrop are hidden via CSS.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  // Trash is a separate, on-demand item source (deleted rows never live in
  // the main `items` state) — loaded whenever the Trash quick view is active.
  const [trashItems, setTrashItems] = useState<DecryptedItem[]>([])
  const [trashLoading, setTrashLoading] = useState(false)

  useEffect(() => {
    if (quickView !== 'trash') return
    let cancelled = false
    setTrashLoading(true)
    loadTrash()
      .then(list => { if (!cancelled) setTrashItems(list) })
      .finally(() => { if (!cancelled) setTrashLoading(false) })
    return () => { cancelled = true }
  }, [quickView, loadTrash])

  async function handleRestore(id: string) {
    await restoreItem(id)
    setTrashItems(prev => prev.filter(it => it.id !== id))
  }

  async function handlePurge(id: string) {
    await purgeItem(id)
    setTrashItems(prev => prev.filter(it => it.id !== id))
  }

  const visibleItems = useMemo(() => {
    let list: DecryptedItem[] = items
    if (quickView === 'favorites') list = list.filter(it => it.data.favorite)
    if (quickView === 'recent') {
      list = [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, RECENT_LIMIT)
    }
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

  const title = useMemo(() => {
    if (quickView === 'trash') return 'Trash'
    const folderName = folderId ? folders.find(f => f.id === folderId)?.name : null
    if (folderName) return folderName
    if (quickView === 'favorites') return 'Favorites'
    if (quickView === 'recent') return 'Recently used'
    if (typeFilter) return TYPE_META[typeFilter].label + 's'
    if (activeTag) return `#${activeTag}`
    return 'All items'
  }, [quickView, folderId, folders, typeFilter, activeTag])

  function handleAdd() {
    setEditorTarget('new')
  }

  function handleEdit(item: DecryptedItem) {
    setEditorTarget(item)
  }

  // Command palette selection: land on the item's detail regardless of the
  // current filters — the item stays "findable" even if it's outside the
  // active folder/type/tag filter, and even if we were sitting in Trash
  // (which has no detail panel, and whose items aren't in `items` anyway).
  function handlePaletteSelect(id: string) {
    if (quickView === 'trash') setQuickView('all')
    setSelectedId(id)
  }

  return (
    <div style={{
      display: 'flex', height: '100%', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden',
      boxShadow: 'var(--sh-2)', position: 'relative',
    }}>
      {/* Responsive layout (≤640px): the fixed-width side panes would collide
          and overflow a phone. The sidebar becomes an off-canvas drawer, the
          detail pane a full-screen overlay, and the header wraps. Desktop
          (≥641px) is untouched — these rules only fire under the media query. */}
      <style>{`
        .aran-drawer-toggle { display: none; }
        .aran-backdrop {
          position: absolute; inset: 0; z-index: 35; border: none;
          background: rgba(8,6,16,0.45); cursor: pointer;
        }
        @media (max-width: 640px) {
          .aran-header { flex-wrap: wrap; row-gap: 10px; }
          .aran-drawer-toggle { display: inline-flex !important; }
          .aran-search { margin-left: 0 !important; width: 100% !important; }
          .aran-sidebar {
            position: absolute !important; inset: 0 auto 0 0; z-index: 40;
            width: min(280px, 82vw) !important;
            transform: translateX(-100%); transition: transform .22s ease;
            box-shadow: var(--sh-3);
          }
          .aran-sidebar--open { transform: translateX(0); }
          .aran-detail {
            position: absolute !important; inset: 0; width: auto !important;
            z-index: 50; border-left: none !important;
          }
        }
      `}</style>

      <FolderTree
        quickView={quickView}
        onQuickView={v => { setQuickView(v); closeDrawer() }}
        typeFilter={typeFilter}
        onType={t => { setTypeFilter(t); closeDrawer() }}
        folderId={folderId}
        onFolder={id => { setFolderId(id); closeDrawer() }}
        activeTag={activeTag}
        onTag={t => { setActiveTag(t); closeDrawer() }}
        items={items}
        mobileOpen={drawerOpen}
      />
      {drawerOpen && (
        <div className="aran-backdrop" aria-label="Close menu" onClick={closeDrawer} />
      )}

      {/* CENTER */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="aran-header" style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            type="button"
            className="aran-drawer-toggle"
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Toggle folders"
            style={{
              alignItems: 'center', justifyContent: 'center', background: 'none', cursor: 'pointer',
              border: '1px solid var(--border)', borderRadius: '9px', padding: '7px',
              color: 'var(--text-2)', flexShrink: 0,
            }}
          >
            <Menu size={16} />
          </button>
          <h3 className="font-display" style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: 'var(--text-1)', letterSpacing: '-0.02em', minWidth: 0 }}>
            {title}
          </h3>

          {quickView !== 'trash' && (
            <>
              <div className="aran-search" style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', width: '236px',
                background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '999px', padding: '7px 13px',
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

              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '9px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  style={{
                    display: 'flex', padding: '7px 9px', border: 'none', cursor: 'pointer',
                    background: viewMode === 'grid' ? 'color-mix(in srgb, var(--app-aran) 16%, transparent)' : 'transparent',
                    color: viewMode === 'grid' ? 'var(--app-aran)' : 'var(--text-muted)',
                  }}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  style={{
                    display: 'flex', padding: '7px 9px', border: 'none', cursor: 'pointer',
                    background: viewMode === 'list' ? 'color-mix(in srgb, var(--app-aran) 16%, transparent)' : 'transparent',
                    color: viewMode === 'list' ? 'var(--app-aran)' : 'var(--text-muted)',
                  }}
                >
                  <List size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setImportExportOpen(true)}
                title="Import / export"
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', background: 'none', cursor: 'pointer',
                  border: '1px solid var(--border)', borderRadius: '999px', padding: '8px 12px',
                  fontSize: '12px', color: 'var(--text-2)', fontFamily: 'inherit',
                }}
              >
                <ArrowLeftRight size={13} /> Import/Export
              </button>

              <button
                type="button"
                onClick={handleAdd}
                style={{
                  background: 'var(--app-aran)', color: '#241a08', fontWeight: 700, fontSize: '12px',
                  border: 'none', borderRadius: '999px', padding: '8px 15px', cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: 'var(--sh-2)',
                }}
              >
                + Add
              </button>
            </>
          )}

          {quickView === 'trash' && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
              {trashItems.length} item{trashItems.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {quickView === 'trash' ? (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trashLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading trash…</div>
            )}
            {!trashLoading && trashItems.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Trash is empty.</div>
            )}
            {trashItems.map(item => (
              <TrashRow key={item.id} item={item} onRestore={handleRestore} onPurge={handlePurge} />
            ))}
          </div>
        ) : (
          <ItemGrid items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} viewMode={viewMode} />
        )}
      </div>

      {/* DETAIL SLIDE-OVER */}
      {quickView !== 'trash' && (
        <ItemDetail item={selectedItem} onClose={() => setSelectedId(null)} onEdit={handleEdit} />
      )}

      {editorTarget !== null && (
        <ItemEditor
          item={editorTarget === 'new' ? null : editorTarget}
          defaultFolderId={folderId}
          onClose={() => setEditorTarget(null)}
        />
      )}

      <CommandPalette onSelect={handlePaletteSelect} />

      {importExportOpen && <ImportExport onClose={() => setImportExportOpen(false)} />}
    </div>
  )
}
