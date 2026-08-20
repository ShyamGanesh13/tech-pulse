'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Bookmark, Trash2, Search, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { TOPICS } from '@/lib/classifier'

type Source = 'hn' | 'reddit' | 'devto' | 'medium' | 'huggingface' | 'arxiv' | 'lobsters' | 'pragmatic'

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
  topics?: string[]
  bookmarked?: number
  relevance?: number
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

const SOURCES: { key: Source; label: string }[] = [
  { key: 'hn',          label: 'HN'        },
  { key: 'reddit',      label: 'Reddit'    },
  { key: 'devto',       label: 'Dev.to'    },
  { key: 'medium',      label: 'Medium'    },
  { key: 'huggingface', label: 'HF Papers' },
  { key: 'arxiv',       label: 'arXiv'     },
  { key: 'lobsters',    label: 'Lobste.rs' },
  { key: 'pragmatic',   label: 'Pragmatic' },
]

/**
 * One rounded, multi-select filter chip. Shared by the Sources and Topics
 * groups in the left rail so both read as the same control, not two widgets
 * that happen to sit near each other.
 *
 * `hint` is the scroll-spy state: in the unfiltered feed the section you are
 * currently reading lights up its source chip without that chip being a filter
 * you actually chose.
 */
function FilterPill({
  label, icon, active, hint, count, onToggle, fullWidth,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  hint?: boolean
  count?: number
  onToggle: () => void
  /** Sources render one per line rather than wrapping — see FilterGroup's layout prop. */
  fullWidth?: boolean
}) {
  const border = active ? 'var(--accent)' : hint ? 'var(--accent)' : 'var(--border)'
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px',
        padding: '5px 11px',
        borderRadius: fullWidth ? '8px' : '999px',
        border: `1px solid ${border}`,
        background: active ? 'var(--accent-bg)' : hint ? 'var(--accent-bg)' : 'transparent',
        cursor: 'pointer',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        color: active || hint ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : undefined,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
      {typeof count === 'number' && count > 0 && (
        <span style={{ fontSize: '10.5px', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </button>
  )
}

/**
 * Group header in the left rail: title on the left, Clear on the right.
 * Clear always renders — dimmed and inert with nothing to clear — so its
 * position doesn't shift as selections change.
 */
function FilterGroup({
  title, onClear, canClear, layout = 'wrap', children,
}: {
  title: string
  onClear: () => void
  canClear: boolean
  /** 'stack' renders one child per line (used for Sources); 'wrap' flows chips. */
  layout?: 'wrap' | 'stack'
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', minHeight: '18px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-secondary)' }}>
          {title}
        </h2>
        <button
          onClick={onClear}
          disabled={!canClear}
          style={{
            background: 'none', border: 'none',
            cursor: canClear ? 'pointer' : 'default',
            color: 'var(--text-muted)', opacity: canClear ? 1 : 0.35,
            fontSize: '11px', fontFamily: 'inherit', padding: 0,
          }}
        >
          Clear
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: layout === 'stack' ? 'column' : 'row', flexWrap: layout === 'stack' ? 'nowrap' : 'wrap', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

// Matched topics shown above the headline. Topics the reader is actively
// filtering on are highlighted; the rest stay muted so the row reads as
// "why this is here" without competing with the title.
function TopicLabels({ topics, activeTopics }: { topics: string[]; activeTopics: string[] }) {
  if (topics.length === 0) return null
  // Active matches first — they explain why this article surfaced.
  const ordered = [
    ...topics.filter(t => activeTopics.includes(t)),
    ...topics.filter(t => !activeTopics.includes(t)),
  ]
  const shown = ordered.slice(0, 2)
  const extra = ordered.length - shown.length

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
      {shown.map(t => {
        const matched = activeTopics.includes(t)
        return (
          <span key={t} style={{
            fontSize: '11px',
            fontWeight: matched ? 600 : 500,
            color: matched ? 'var(--accent)' : 'var(--text-muted)',
            letterSpacing: '0.01em',
          }}>
            {t}
          </span>
        )
      })}
      {extra > 0 && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.7 }}>+{extra}</span>
      )}
    </div>
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
  corpusClassified,
  activeTopics,
  onBookmarkToggle,
  onDelete,
}: {
  article: Article
  isBookmarkView: boolean
  /** See the note on offTopic below — gates the whole off-topic treatment. */
  corpusClassified: boolean
  activeTopics: string[]
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

  // Off-topic (matched none of your interest topics) → dim so it recedes but stays.
  //
  // Gated on corpusClassified because "no topics" has two very different causes
  // and only one of them is a judgement about this article. If classification
  // never ran — unreachable model host, no API key — EVERY article comes back
  // with zero topics, and dimming them all told you the feed was junk when the
  // truth was that nothing had looked at it. Absence of a signal is not a
  // negative signal, so with nothing tagged anywhere we say nothing at all.
  const offTopic = !isBookmarkView && corpusClassified && (article.topics?.length ?? 0) === 0

  // 3px source-colored spine: per-source recognition at almost no space cost.
  const accent = SOURCE_CONFIG[article.source]?.color ?? 'var(--border)'

  return (
    <div style={{
           background: 'var(--card-bg)',
           border: '1px solid var(--border)',
           borderLeft: `3px solid ${accent}`,
           opacity: offTopic ? 0.45 : 1,
           transition: 'opacity 0.15s',
         }}
         className="rounded-lg p-4 mb-2">
      <div className="flex items-start gap-3">
        <img
          src={`/icons/${article.source}.svg`}
          alt={article.source}
          className="w-4 h-4 mt-0.5 shrink-0 rounded-sm"
        />
        <div className="flex-1 min-w-0">
          <TopicLabels topics={article.topics ?? []} activeTopics={activeTopics} />
          <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: '1.45', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            {article.title}
          </div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: 'var(--text-muted)' }}>
            {metaParts}
            {offTopic && <span style={{ marginLeft: '6px', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0 5px', fontSize: '10px' }}>off-topic</span>}
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
  source, articles, isBookmarkView, corpusClassified, activeTopics, onBookmarkToggle, onDelete,
}: {
  source: string
  articles: Article[]
  isBookmarkView: boolean
  corpusClassified: boolean
  activeTopics: string[]
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
          corpusClassified={corpusClassified}
          activeTopics={activeTopics}
          onBookmarkToggle={onBookmarkToggle}
          onDelete={onDelete}
        />
      ))}
    </section>
  )
}

export default function FeedPage() {
  // Sources and topics are both multi-select filters now, living side by side
  // in the left rail. An empty source selection means "every source" — the same
  // thing the old "All" tab did, without needing a chip that means "no filter".
  const [activeSources, setActiveSources] = useState<Source[]>([])
  const [isBookmarkView, setIsBookmarkView] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [bookmarks, setBookmarks] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  // Reported by /api/refresh. mode 'llm' is a clean run; 'partial' and 'keyword'
  // mean some or all topics are keyword-derived and worth flagging.
  const [classifier, setClassifier] = useState<{ mode: string; note?: string } | null>(null)
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

  const [activeTopics, setActiveTopics] = useState<string[]>([])
  const [railOpen, setRailOpen] = useState(true)
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  useEffect(() => {
    try { setActiveTopics(JSON.parse(localStorage.getItem('tech-pulse-topics') ?? '[]')) } catch { /* ignore */ }
    try { setActiveSources(JSON.parse(localStorage.getItem('tech-pulse-sources') ?? '[]')) } catch { /* ignore */ }
    const rail = localStorage.getItem('tech-pulse-rail-open')
    if (rail !== null) setRailOpen(rail === 'true')
    setFiltersHydrated(true)
  }, [])
  useEffect(() => {
    if (!filtersHydrated) return
    localStorage.setItem('tech-pulse-topics', JSON.stringify(activeTopics))
    localStorage.setItem('tech-pulse-sources', JSON.stringify(activeSources))
    localStorage.setItem('tech-pulse-rail-open', String(railOpen))
  }, [activeTopics, activeSources, railOpen, filtersHydrated])

  const loadBookmarks = useCallback(() => {
    fetch('/api/articles/bookmark')
      .then(r => r.json())
      .then(d => setBookmarks(d.articles ?? []))
  }, [])

  // /api/feed still takes one source per call, so a multi-source selection is
  // N requests merged here. Fetching source=all and filtering client-side would
  // have been one request, but the API caps a run at ~100 rows overall — a
  // narrow selection would then show far fewer articles than picking that same
  // source alone used to. One call per selected source keeps the counts honest.
  const loadArticles = useCallback((sources: Source[], topics: string[]) => {
    setLoading(true)
    const topicsParam = topics.length > 0 ? `&topics=${topics.map(encodeURIComponent).join(',')}` : ''
    const targets: string[] = sources.length > 0 ? sources : ['all']
    Promise.all(
      targets.map(src =>
        fetch(`/api/feed?source=${src}${topicsParam}`)
          .then(r => r.json())
          .catch(() => ({ articles: [] })),
      ),
    ).then(results => {
      const seen = new Set<string>()
      const merged: Article[] = []
      for (const data of results) {
        for (const a of (data.articles ?? []) as Article[]) {
          if (seen.has(a.id)) continue
          seen.add(a.id)
          merged.push(a)
        }
      }
      setArticles(merged)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])
  useEffect(() => {
    if (isBookmarkView) { setLoading(false); return }
    loadArticles(activeSources, activeTopics)
  }, [activeSources, activeTopics, isBookmarkView, loadArticles])

  function toggleSource(key: Source) {
    setActiveSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const refreshed = await fetch('/api/refresh', { method: 'POST' })
      const refreshBody = await refreshed.json().catch(() => null)
      // A degraded classifier used to be invisible. Say it out loud instead.
      setClassifier(refreshBody?.classifier ?? null)
      loadArticles(activeSources, activeTopics)
      setLastRefreshed(new Date())
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

  // Scroll spy — highlights the source chip for the section you're reading.
  useEffect(() => {
    if (isBookmarkView) { setScrollSection(null); return }
    const HEADER_OFFSET = 60
    const handleScroll = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-source-section]'))
      let current: string | null = null
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= HEADER_OFFSET) current = section.dataset.source ?? null
      }
      setScrollSection(current)
    }
    const scrollEl = document.querySelector('main.apps-main') ?? window
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [isBookmarkView, articles])

  const displayArticles = isBookmarkView ? bookmarks : articles
  const grouped = displayArticles.reduce<Record<string, Article[]>>((acc, a) => {
    if (!acc[a.source]) acc[a.source] = []
    acc[a.source].push(a)
    return acc
  }, {})

  // Did anything in this corpus get tagged at all?
  //
  // Derived rather than stored, because the question is about the whole fetch,
  // not any one article: no classifier tags zero out of ~175 AI-sourced posts,
  // so an entirely untagged corpus means classification did not happen. That
  // distinguishes "we looked and this one didn't match" from "nobody looked",
  // which is the distinction the off-topic badge was missing. Search results and
  // topic-filtered views are both non-empty in the tagged case, so this stays
  // correct there too.
  const corpusClassified = displayArticles.some(a => (a.topics?.length ?? 0) > 0)
    || searchResults.some(a => (a.topics?.length ?? 0) > 0)

  const sourceOrder: string[] = SOURCES.map(s => s.key)
  // Total on-topic weight of a source's articles — used to order sections
  const relevanceOf = (s: string) => (grouped[s] ?? []).reduce((sum, a) => sum + (a.relevance ?? 0), 0)
  const selectedOrAll: string[] = (isBookmarkView || activeSources.length === 0)
    ? sourceOrder
    : activeSources
  const visibleSources = selectedOrAll
    .filter(s => (grouped[s]?.length ?? 0) > 0)
    .sort((a, b) => isBookmarkView ? 0 : relevanceOf(b) - relevanceOf(a))

  const showingSearch = searchOpen && searchMode !== null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Top bar: identity, view switches, clock. Filters live in the rail. */}
      <div className="sticky top-0 z-20" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '44px' }}>
          <button
            onClick={() => setRailOpen(v => !v)}
            title={railOpen ? 'Hide filters' : 'Show filters'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', padding: '4px', margin: '-4px 0',
              display: 'flex', alignItems: 'center',
            }}
          >
            {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>

          <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>Thagaval</span>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setIsBookmarkView(v => !v)}
            title="Saved bookmarks"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '999px',
              fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
              ...(isBookmarkView
                ? { border: '1px solid var(--text-primary)', background: 'var(--text-primary)', color: 'var(--bg)', fontWeight: 600 }
                : { border: '1px solid var(--border)', background: 'transparent', color: bookmarks.length > 0 ? '#f59e0b' : 'var(--text-muted)' })
            }}
          >
            <Bookmark size={13} fill={isBookmarkView ? 'currentColor' : bookmarks.length > 0 ? '#f59e0b' : 'none'} />
            {bookmarks.length > 0 && <span style={{ fontSize: '11px' }}>{bookmarks.length}</span>}
          </button>

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

          {lastRefreshed && !refreshing && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {classifier && classifier.mode !== 'llm' && !refreshing && (
            <span
              title={classifier.note ?? 'Topics were derived from title keywords, not an AI model.'}
              style={{
                fontSize: '10px', color: '#f59e0b', border: '1px solid #f59e0b',
                borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', cursor: 'help',
              }}
            >
              {classifier.mode === 'partial' ? 'partial AI topics' : 'keyword topics'}
            </span>
          )}

          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', flexShrink: 0, marginLeft: '4px' }}>
            <span suppressHydrationWarning style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span suppressHydrationWarning style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', fontFamily: "'SF Mono', 'Menlo', 'Cascadia Code', monospace", fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Search bar row — shown when search is toggled */}
      {searchOpen && (
        <div className="sticky z-20" style={{ top: '44px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '8px 20px' }}>
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

      <div className="thagaval-body" style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Left filter rail — Sources, then Topics. Collapses via the top-bar toggle. */}
        {railOpen && (
        <aside className="thagaval-rail" style={{
          width: '236px',
          flexShrink: 0,
          position: 'sticky',
          top: '44px',
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 44px)',
          overflowY: 'auto',
          padding: '20px 18px 32px',
          borderRight: '1px solid var(--border)',
        }}>
          <FilterGroup title="Sources" layout="stack" canClear={activeSources.length > 0} onClear={() => setActiveSources([])}>
            {SOURCES.map(s => (
              <FilterPill
                key={s.key}
                label={s.label}
                icon={<img src={`/icons/${s.key}.svg`} alt="" style={{ width: 13, height: 13, borderRadius: 2 }} />}
                active={activeSources.includes(s.key)}
                hint={!activeSources.includes(s.key) && !isBookmarkView && scrollSection === s.key}
                count={grouped[s.key]?.length}
                onToggle={() => toggleSource(s.key)}
                fullWidth
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Topics" canClear={activeTopics.length > 0} onClear={() => setActiveTopics([])}>
            {TOPICS.map(t => (
              <FilterPill
                key={t}
                label={t}
                active={activeTopics.includes(t)}
                onToggle={() => setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
              />
            ))}
          </FilterGroup>
        </aside>
        )}

        <main style={{ flex: 1, minWidth: 0, padding: '24px 20px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Search results view */}
          {showingSearch && (
            <>
              {searchResults.length === 0 && !searching && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No matching articles found.</p>
              )}
              {searchResults.map(a => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  isBookmarkView={false}
                  corpusClassified={corpusClassified}
                  activeTopics={activeTopics}
                  onBookmarkToggle={handleBookmarkToggle}
                  onDelete={handleDeleteBookmark}
                />
              ))}
            </>
          )}

          {/* Normal feed view */}
          {!showingSearch && (
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
                  corpusClassified={corpusClassified}
                  activeTopics={activeTopics}
                  onBookmarkToggle={handleBookmarkToggle}
                  onDelete={handleDeleteBookmark}
                />
              ))}
            </>
          )}
          </div>
        </main>
      </div>
    </div>
  )
}
