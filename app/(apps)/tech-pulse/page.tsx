'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Bookmark, Trash2, Search, X } from 'lucide-react'

type Source = 'all' | 'hn' | 'reddit' | 'devto' | 'medium' | 'huggingface' | 'arxiv' | 'lobsters' | 'pragmatic' | 'bookmarks'

const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

interface Article {
  id: string
  source: string
  title: string
  url: string
  score: number
  comment_count: number
  subreddit: string | null
  author: string | null
  fetched_at: string
  summary: string | null
  bookmarked?: number
}

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  hn:           { label: 'Hacker News',        color: '#FF6600' },
  reddit:       { label: 'Reddit',             color: '#FF4500' },
  devto:        { label: 'Dev.to',             color: '#3D3D3D' },
  medium:       { label: 'Medium',             color: '#02B875' },
  huggingface:  { label: 'Hugging Face',       color: '#FFD21E' },
  arxiv:        { label: 'arXiv',              color: '#B31B1B' },
  lobsters:     { label: 'Lobste.rs',          color: '#AC130D' },
  pragmatic:    { label: 'Pragmatic Engineer', color: '#E94560' },
}

const TABS: { key: Source; label: string }[] = [
  { key: 'all',         label: 'All'       },
  { key: 'hn',          label: 'HN'        },
  { key: 'reddit',      label: 'Reddit'    },
  { key: 'devto',       label: 'Dev.to'    },
  { key: 'medium',      label: 'Medium'    },
  { key: 'huggingface', label: 'HF Papers' },
  { key: 'arxiv',       label: 'arXiv'     },
  { key: 'lobsters',    label: 'Lobste.rs' },
  { key: 'pragmatic',   label: 'Pragmatic' },
]

function TopicBubble({ topic, active, onToggle }: { topic: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '4px 12px',
        borderRadius: '999px',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-bg)' : 'transparent',
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: 'inherit',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: active ? 500 : 400,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {topic}
    </button>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ago`
  if (h > 0) return `${h}h ago`
  return `${m}m ago`
}

function ArticleCard({
  article,
  isBookmarkView,
  onBookmarkToggle,
  onDelete,
}: {
  article: Article
  isBookmarkView: boolean
  onBookmarkToggle: (id: string, current: boolean) => void
  onDelete: (id: string, article: Article) => void
}) {
  const [summary, setSummary] = useState<string | null>(article.summary)
  const [expanded, setExpanded] = useState(!!article.summary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const isBookmarked = !!article.bookmarked

  async function handleSummarize() {
    if (summary) { setExpanded(v => !v); return }
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, url: article.url }),
      })
      const data = await res.json()
      if (data.summary) { setSummary(data.summary); setExpanded(true) }
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const metaParts = [
    article.score > 0 && `${article.score} pts`,
    article.comment_count > 0 && `${article.comment_count} comments`,
    article.subreddit && `r/${article.subreddit}`,
    timeAgo(article.fetched_at),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}
         className="rounded-lg p-4 mb-2">
      <div className="flex items-start gap-3">
        <img
          src={`/icons/${article.source}.svg`}
          alt={article.source}
          className="w-4 h-4 mt-0.5 shrink-0 rounded-sm"
        />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: '1.4', color: 'var(--text-primary)' }}>
            {article.title}
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
            {metaParts}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexShrink: 0, alignItems: 'center' }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', textDecoration: 'none', opacity: 1, transition: 'opacity 0.15s' }}
          >
            ↗
          </a>
          {article.source === 'hn' && (
            <a
              href={`https://news.ycombinator.com/item?id=${article.id.replace('hn:', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              title="HN discussion"
              style={{ border: '1px solid #FF6600', color: '#FF6600', fontSize: '11px', fontWeight: 700, padding: '3px 7px', borderRadius: '4px', textDecoration: 'none', transition: 'opacity 0.15s' }}
            >
              HN
            </a>
          )}
          <button
            onClick={handleSummarize}
            disabled={loading}
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit', opacity: loading ? 0.4 : 1, transition: 'opacity 0.15s' }}
          >
            {loading ? '…' : summary && expanded ? '✦ hide' : '✦ AI'}
          </button>

          {/* Bookmark toggle (regular articles) or Delete (bookmark view) */}
          {isBookmarkView ? (
            <button
              onClick={() => onDelete(article.id, article)}
              title="Remove bookmark"
              style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', lineHeight: 0, transition: 'opacity 0.15s' }}
            >
              <Trash2 size={12} />
            </button>
          ) : (
            <button
              onClick={() => onBookmarkToggle(article.id, isBookmarked)}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              style={{
                border: `1px solid ${isBookmarked ? '#f59e0b' : 'var(--border)'}`,
                color: isBookmarked ? '#f59e0b' : 'var(--text-muted)',
                padding: '3px 7px', borderRadius: '4px', cursor: 'pointer',
                background: isBookmarked ? 'rgba(245,158,11,0.1)' : 'transparent',
                display: 'flex', alignItems: 'center', lineHeight: 0, transition: 'all 0.15s',
              }}
            >
              <Bookmark size={12} fill={isBookmarked ? '#f59e0b' : 'none'} />
            </button>
          )}
        </div>
      </div>

      {expanded && summary && (
        <div
          style={{
            marginTop: '12px', paddingTop: '12px', padding: '10px 12px',
            borderTop: '1px solid var(--border)', borderRadius: '6px',
            background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6',
          }}
        >
          {summary}
        </div>
      )}

      {error && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
          Summary unavailable — try again.
        </div>
      )}
    </div>
  )
}

function SourceSection({
  source, articles, isBookmarkView, onBookmarkToggle, onDelete,
}: {
  source: string
  articles: Article[]
  isBookmarkView: boolean
  onBookmarkToggle: (id: string, current: boolean) => void
  onDelete: (id: string, article: Article) => void
}) {
  const config = SOURCE_CONFIG[source]
  return (
    <section data-source-section data-source={source} style={{ marginBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ color: config.color, fontSize: '10px', lineHeight: 1 }}>●</span>
        <h2 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
          {config.label}
        </h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          ({articles.length})
        </span>
      </div>
      {articles.map(a => (
        <ArticleCard
          key={a.id}
          article={a}
          isBookmarkView={isBookmarkView}
          onBookmarkToggle={onBookmarkToggle}
          onDelete={onDelete}
        />
      ))}
    </section>
  )
}

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<Source>('all')
  const [articles, setArticles] = useState<Article[]>([])
  const [bookmarks, setBookmarks] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scrollSection, setScrollSection] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Article[]>([])
  const [searchMode, setSearchMode] = useState<'semantic' | 'keyword' | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const [activeTopics, setActiveTopics] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('tech-pulse-topics') ?? '[]') } catch { return [] }
  })
  useEffect(() => {
    localStorage.setItem('tech-pulse-topics', JSON.stringify(activeTopics))
  }, [activeTopics])

  const loadBookmarks = useCallback(() => {
    fetch('/api/articles/bookmark')
      .then(r => r.json())
      .then(d => setBookmarks(d.articles ?? []))
  }, [])

  const loadArticles = useCallback((tab: Source, topics: string[]) => {
    if (tab === 'bookmarks') { setLoading(false); return }
    setLoading(true)
    const topicsParam = topics.length > 0 ? `&topics=${topics.map(encodeURIComponent).join(',')}` : ''
    fetch(`/api/feed?source=${tab}${topicsParam}`)
      .then(r => r.json())
      .then(data => { setArticles(data.articles ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])
  useEffect(() => { loadArticles(activeTab, activeTopics) }, [activeTab, activeTopics, loadArticles])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/refresh', { method: 'POST' })
      const topicsParam = activeTopics.length > 0 ? `&topics=${activeTopics.map(encodeURIComponent).join(',')}` : ''
      const res = await fetch(`/api/feed?source=${activeTab === 'bookmarks' ? 'all' : activeTab}${topicsParam}`)
      const data = await res.json()
      setArticles(data.articles ?? [])
      loadBookmarks()
    } catch { /* silent */ } finally {
      setRefreshing(false)
    }
  }

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearchMode(null); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/articles/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setSearchResults(data.articles ?? [])
      setSearchMode(data.mode ?? null)
    } catch { setSearchResults([]) } finally { setSearching(false) }
  }, [])

  function openSearch() {
    setSearchOpen(true)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchMode(null)
  }

  const handleBookmarkToggle = useCallback(async (id: string, current: boolean) => {
    // Optimistic update
    setArticles(prev => prev.map(a => a.id === id ? { ...a, bookmarked: current ? 0 : 1 } : a))
    await fetch('/api/articles/bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, bookmarked: !current }),
    })
    loadBookmarks()
  }, [loadBookmarks])

  const handleDeleteBookmark = useCallback(async (id: string, article: Article) => {
    // Optimistically remove from bookmarks panel
    setBookmarks(prev => prev.filter(a => a.id !== id))
    // Set bookmarked=0 in DB (does NOT delete the row)
    await fetch(`/api/articles/bookmark?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    // Add the article back into the feed list immediately
    setArticles(prev => {
      if (prev.some(a => a.id === id)) return prev.map(a => a.id === id ? { ...a, bookmarked: 0 } : a)
      return [{ ...article, bookmarked: 0 }, ...prev]
    })
  }, [])

  // Scroll spy for 'all' tab
  useEffect(() => {
    if (activeTab !== 'all') { setScrollSection(null); return }
    const HEADER_OFFSET = 116
    const handleScroll = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-source-section]'))
      let current: string | null = null
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= HEADER_OFFSET) current = section.dataset.source ?? null
      }
      setScrollSection(current)
    }
    const scrollEl = document.querySelector('main') ?? window
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [activeTab, articles])

  const isBookmarkView = activeTab === 'bookmarks'

  const displayArticles = isBookmarkView ? bookmarks : articles
  const grouped = displayArticles.reduce<Record<string, Article[]>>((acc, a) => {
    if (!acc[a.source]) acc[a.source] = []
    acc[a.source].push(a)
    return acc
  }, {})

  const sourceOrder: string[] = ['hn', 'reddit', 'devto', 'medium', 'huggingface', 'arxiv', 'lobsters', 'pragmatic']
  const visibleSources = activeTab === 'all' || isBookmarkView
    ? sourceOrder.filter(s => (grouped[s]?.length ?? 0) > 0)
    : [activeTab as string].filter(s => (grouped[s]?.length ?? 0) > 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Row 1: App name */}
      <div className="sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '36px' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>Tech Pulse</span>
        </div>
      </div>

      {/* Row 2: Topic filter pills + clock */}
      <div className="sticky z-10" style={{ top: '37px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}>
          <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {TOPICS.map(t => (
              <TopicBubble
                key={t} topic={t} active={activeTopics.includes(t)}
                onToggle={() => setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
              />
            ))}
            {activeTopics.length > 0 && (
              <button onClick={() => setActiveTopics([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'inherit' }}>Clear</button>
            )}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
            <span suppressHydrationWarning style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span suppressHydrationWarning style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', fontFamily: "'SF Mono', 'Menlo', 'Cascadia Code', monospace", fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Source tabs + bookmark tab + refresh */}
      <div className="sticky z-10" style={{ top: '74px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
          <div style={{ display: 'flex', gap: '2px', flex: 1, alignItems: 'center' }}>
            {TABS.map(t => {
              const isActive = activeTab === t.key
              const isScrolled = activeTab === 'all' && scrollSection === t.key
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 14px', borderRadius: '999px',
                  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
                  ...(isActive
                    ? { border: 'none', background: 'var(--text-primary)', color: 'var(--bg)', fontWeight: 600 }
                    : isScrolled
                    ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 500 }
                    : { border: 'none', background: 'transparent', color: 'var(--text-secondary)' })
                }}>
                  {t.key !== 'all' && <img src={`/icons/${t.key}.svg`} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />}
                  {t.label}
                </button>
              )
            })}

            {/* Bookmarks tab */}
            <button
              onClick={() => setActiveTab('bookmarks')}
              title="Saved bookmarks"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', borderRadius: '999px',
                fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
                ...(isBookmarkView
                  ? { border: 'none', background: 'var(--text-primary)', color: 'var(--bg)', fontWeight: 600 }
                  : { border: 'none', background: 'transparent', color: bookmarks.length > 0 ? '#f59e0b' : 'var(--text-muted)' })
              }}
            >
              <Bookmark size={13} fill={isBookmarkView || bookmarks.length > 0 ? (isBookmarkView ? 'currentColor' : '#f59e0b') : 'none'} />
              {bookmarks.length > 0 && <span style={{ fontSize: '11px' }}>{bookmarks.length}</span>}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
            <button
              onClick={searchOpen ? closeSearch : openSearch}
              title="Search articles"
              style={{
                background: searchOpen ? 'var(--accent-bg)' : 'none',
                border: `1px solid ${searchOpen ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '6px', cursor: 'pointer',
                color: searchOpen ? 'var(--accent)' : 'var(--text-secondary)',
                padding: '4px 8px', display: 'flex', alignItems: 'center', transition: 'all 0.15s',
              }}
            >
              <Search size={13} />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Fetch latest articles"
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                cursor: refreshing ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)',
                fontSize: '13px', padding: '4px 9px', fontFamily: 'inherit',
                opacity: refreshing ? 0.5 : 1, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
              <span style={{ fontSize: '12px' }}>{refreshing ? 'Fetching…' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search bar row — shown when search is toggled */}
      {searchOpen && (
        <div className="sticky z-10" style={{ top: '114px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '8px 20px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchQuery); if (e.key === 'Escape') closeSearch() }}
                placeholder="Search articles semantically… (press Enter)"
                style={{
                  width: '100%', padding: '7px 36px 7px 30px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchMode(null); searchRef.current?.focus() }}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => handleSearch(searchQuery)}
              disabled={searching || !searchQuery.trim()}
              style={{
                padding: '7px 14px', borderRadius: '6px', border: '1px solid var(--accent)',
                background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '13px',
                fontFamily: 'inherit', cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: searching || !searchQuery.trim() ? 0.5 : 1, fontWeight: 500, whiteSpace: 'nowrap',
              }}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searchMode && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {searchMode === 'semantic' ? '✦ Semantic search via qwen3-embedding' : '⌕ Keyword match'} — {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Search results view */}
        {searchOpen && searchMode !== null && (
          <>
            {searchResults.length === 0 && !searching && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No matching articles found.</p>
            )}
            {searchResults.map(a => (
              <ArticleCard
                key={a.id}
                article={a}
                isBookmarkView={false}
                onBookmarkToggle={handleBookmarkToggle}
                onDelete={handleDeleteBookmark}
              />
            ))}
          </>
        )}

        {/* Normal feed view */}
        {!(searchOpen && searchMode !== null) && (
          <>
            {isBookmarkView && bookmarks.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                No bookmarks yet — click the <Bookmark size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> icon on any article to save it.
              </p>
            )}
            {!isBookmarkView && loading && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</p>
            )}
            {!isBookmarkView && !loading && articles.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                No articles yet — the first fetch runs at 8am UTC.<br />
                You can also hit <strong>Refresh</strong> to fetch now.
              </p>
            )}
            {visibleSources.map(s => (
              <SourceSection
                key={s}
                source={s}
                articles={grouped[s] ?? []}
                isBookmarkView={isBookmarkView}
                onBookmarkToggle={handleBookmarkToggle}
                onDelete={handleDeleteBookmark}
              />
            ))}
          </>
        )}
      </main>
    </div>
  )
}
