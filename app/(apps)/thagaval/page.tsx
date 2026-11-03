'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Bookmark, Trash2, Search, X, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { TOPICS } from '@/lib/classifier'
import { SOURCES as REGISTRY, SOURCE_KEYS, type Source } from '@/lib/source-registry'
import FeedSettings, { type FeedPrefs } from './FeedSettings'

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

// Both derived from lib/source-registry.ts. These used to be two hand-written
// literals here plus a third copy of the Source union above, and a fourth
// validSources array in the feed route — adding a source meant editing all four.
const SOURCE_CONFIG: Record<string, { label: string; color: string }> = Object.fromEntries(
  SOURCE_KEYS.map(k => [k, { label: REGISTRY[k].label, color: REGISTRY[k].color }]),
)

// shortLabel, because the rail pills are narrow.
const SOURCES: { key: Source; label: string }[] =
  SOURCE_KEYS.map(k => ({ key: k, label: REGISTRY[k].shortLabel }))

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
  label, icon, active, hint, count, hue = 'var(--app-thagaval)', onToggle,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  hint?: boolean
  count?: number
  /** Fill colour when active — a source's brand colour, or the app hue for topics. */
  hue?: string
  onToggle: () => void
}) {
  // Active → solid fill in the pill's hue (white text). Hint (scroll-spy) → a
  // tinted ghost in that hue. Resting → hairline ghost.
  const style: React.CSSProperties = active
    ? {
        border: `1px solid ${hue}`,
        background: hue,
        color: '#fff',
        fontWeight: 600,
        boxShadow: `var(--tile-glow) ${hue}`,
      }
    : hint
      ? {
          border: `1px solid color-mix(in srgb, ${hue} 55%, transparent)`,
          background: `color-mix(in srgb, ${hue} 14%, transparent)`,
          color: hue,
          fontWeight: 500,
        }
      : {
          border: '1px solid var(--border)',
          background: 'var(--glass)',
          color: 'var(--text-2)',
          fontWeight: 450,
        }
  return (
    <button
      onClick={onToggle}
      className="thag-pill"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 11px',
        borderRadius: '999px',
        cursor: 'pointer',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        ...style,
      }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="tnum" style={{ fontSize: '10.5px', opacity: 0.65 }}>{count}</span>
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
  title, onClear, canClear, children,
}: {
  title: string
  onClear: () => void
  canClear: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', minHeight: '18px' }}>
        <h2 className="font-display" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.11em', color: 'var(--text-3)' }}>
          {title}
        </h2>
        <button
          onClick={onClear}
          disabled={!canClear}
          style={{
            background: 'none', border: 'none',
            cursor: canClear ? 'pointer' : 'default',
            color: canClear ? 'var(--app-thagaval)' : 'var(--text-muted)', opacity: canClear ? 1 : 0.35,
            fontSize: '11px', fontFamily: 'inherit', padding: 0, fontWeight: 500,
          }}
        >
          Clear
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

// Classified topics, rendered as filled chips in the card footer. Topics the
// reader is actively filtering on get a solid fill (they explain why this
// article surfaced); the rest stay a soft tint. Returns bare chips — the
// footer row provides the flex wrapper.
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
    <>
      {shown.map(t => {
        const matched = activeTopics.includes(t)
        return (
          <span key={t} style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: matched ? '#fff' : 'var(--app-thagaval)',
            padding: '2px 9px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            background: matched ? 'var(--app-thagaval)' : 'color-mix(in srgb, var(--app-thagaval) 14%, transparent)',
            border: `1px solid ${matched ? 'var(--app-thagaval)' : 'color-mix(in srgb, var(--app-thagaval) 32%, transparent)'}`,
          }}>
            {t}
          </span>
        )
      })}
      {extra > 0 && (
        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', opacity: 0.8 }}>+{extra}</span>
      )}
    </>
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

  // Source color drives the dot + any brand-tinted accents on the card.
  const accent = SOURCE_CONFIG[article.source]?.color ?? 'var(--border)'
  const sourceLabel = SOURCE_CONFIG[article.source]?.label ?? article.source

  const iconBtn: React.CSSProperties = {
    border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '12px',
    padding: '4px 9px', borderRadius: 'var(--radius-sm)', background: 'var(--glass)',
    fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
    display: 'flex', alignItems: 'center', lineHeight: 0, transition: 'all 0.2s',
  }

  return (
    <div className="thag-card"
         style={{
           background: 'var(--glass)',
           backdropFilter: 'blur(var(--blur))',
           WebkitBackdropFilter: 'blur(var(--blur))',
           border: '1px solid var(--border)',
           borderRadius: 'var(--radius-sm)',
           boxShadow: 'var(--sh-2)',
           opacity: offTopic ? 0.5 : 1,
           padding: '15px 16px',
           height: '100%',
           display: 'flex',
           flexDirection: 'column',
           gap: '9px',
         }}>
      {/* Source row: brand dot + source name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `var(--tile-glow) ${accent}`, flexShrink: 0 }} />
        <span className="font-display" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sourceLabel}
        </span>
      </div>

      {/* Title → article */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-display thag-title"
        style={{ fontSize: '15.5px', fontWeight: 600, lineHeight: '1.35', color: 'var(--text-1)', letterSpacing: '-0.01em', textDecoration: 'none' }}
      >
        {article.title}
      </a>

      {/* Summary — clamped to a few lines until expanded via the ✦ action */}
      {summary && (
        <div
          className={expanded ? undefined : 'thag-summary'}
          style={{ fontSize: '12.5px', lineHeight: '1.55', color: 'var(--text-3)' }}
        >
          {summary}
        </div>
      )}
      {error && (
        <div style={{ fontSize: '12px', color: '#ef4444' }}>
          Summary unavailable — try again.
        </div>
      )}

      {/* Footer: topic chip + meta (left), subtle actions (right) */}
      <div style={{ marginTop: 'auto', paddingTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
          <TopicLabels topics={article.topics ?? []} activeTopics={activeTopics} />
          <span className="tnum" style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{metaParts}</span>
          {offTopic && <span style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '999px', padding: '1px 7px', fontSize: '10px' }}>off-topic</span>}
        </div>
        <div className="thag-actions" style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open article"
            className="thag-btn"
            style={iconBtn}
          >
            ↗
          </a>
          {article.source === 'hn' && (
            <a
              href={`https://news.ycombinator.com/item?id=${article.id.replace('hn:', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              title="HN discussion"
              className="thag-btn"
              style={{ ...iconBtn, border: '1px solid #FF6600', color: '#FF6600', fontSize: '11px', fontWeight: 700, background: 'rgba(255,102,0,0.08)' }}
            >
              HN
            </a>
          )}
          <button
            onClick={handleSummarize}
            disabled={loading}
            className="thag-btn"
            style={{ ...iconBtn, color: 'var(--ai)', border: '1px solid color-mix(in srgb, var(--ai) 35%, var(--border))', opacity: loading ? 0.4 : 1 }}
          >
            {loading ? '…' : summary && expanded ? '✦ hide' : '✦ AI'}
          </button>

          {/* Bookmark toggle (regular articles) or Delete (bookmark view) */}
          {isBookmarkView ? (
            <button
              onClick={() => onDelete(article.id, article)}
              title="Remove bookmark"
              className="thag-btn"
              style={{ ...iconBtn, border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '4px 8px' }}
            >
              <Trash2 size={12} />
            </button>
          ) : (
            <button
              onClick={() => onBookmarkToggle(article.id, isBookmarked)}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              className="thag-btn"
              style={{
                ...iconBtn, padding: '4px 8px',
                border: `1px solid ${isBookmarked ? '#f59e0b' : 'var(--border)'}`,
                color: isBookmarked ? '#f59e0b' : 'var(--text-muted)',
                background: isBookmarked ? 'rgba(245,158,11,0.12)' : 'var(--glass)',
              }}
            >
              <Bookmark size={12} fill={isBookmarked ? '#f59e0b' : 'none'} />
            </button>
          )}
        </div>
      </div>
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
    <section data-source-section data-source={source} style={{ marginBottom: '30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: config.color, boxShadow: `var(--tile-glow) ${config.color}`, flexShrink: 0 }} />
        <h2 className="font-display" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-2)' }}>
          {config.label}
        </h2>
        <span className="tnum" style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface-1)', border: '1px solid var(--hair)', borderRadius: '999px', padding: '1px 8px' }}>
          {articles.length}
        </span>
      </div>
      <div className="thag-grid">
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
      </div>
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

  // Search state — the input is a permanent fixture of the top bar, not a
  // togglable mode. An empty query means "show the normal feed"; any other
  // query means "show search results", with no separate open/closed state.
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

  // The durable subscription, edited in the gear panel. Null until loaded, and
  // treated as "everything" until then so the rail does not flicker from empty
  // to populated on first paint.
  const [prefs, setPrefs] = useState<FeedPrefs | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    fetch('/api/articles/preferences')
      .then(r => r.json())
      .then(d => setPrefs({ sources: d.sources ?? [], topics: d.topics ?? [] }))
      .catch(() => { /* rail falls back to the full catalog */ })
  }, [])

  const railSources = prefs ? SOURCES.filter(s => prefs.sources.includes(s.key)) : SOURCES
  const railTopics = prefs ? TOPICS.filter(t => prefs.topics.includes(t)) : TOPICS

  // PRUNE STALE RAIL SELECTIONS. The rail's selection is persisted in
  // localStorage and can name sources or topics that have since been switched
  // off in the gear. Left alone, the rail would be filtering on a pill that is
  // no longer rendered — the feed reads as mysteriously empty with nothing
  // visibly selected. Runs on load and after every save.
  useEffect(() => {
    if (!prefs) return
    setActiveSources(prev => prev.filter(x => prefs.sources.includes(x)))
    setActiveTopics(prev => prev.filter(x => prefs.topics.includes(x)))
  }, [prefs])
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
    // 'all' is still one request rather than one per subscribed source: the feed
    // route intersects it with the stored subscription, so it already means
    // "everything I subscribe to" rather than every row present.
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
    // `prefs` is a dependency because /api/feed intersects the request with the
    // stored subscription server-side: switching a source off changes the
    // response for an unchanged rail selection.
  }, [activeSources, activeTopics, isBookmarkView, loadArticles, prefs])

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

  // Live search: fires ~300ms after typing stops. Enter (below) skips the wait.
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchMode(null); return }
    const t = setTimeout(() => handleSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery, handleSearch])

  function clearSearch() {
    setSearchQuery('')
    setSearchResults([])
    setSearchMode(null)
    searchRef.current?.focus()
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

  const showingSearch = searchQuery.trim().length > 0

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Top bar: identity, view switches, clock. Filters live in the rail. */}
      <div className="sticky top-0 z-20" style={{ background: 'var(--glass)', backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--app-thagaval)', boxShadow: 'var(--tile-glow) var(--app-thagaval)', flexShrink: 0 }} />
          <span className="font-display" style={{ color: 'var(--text-1)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>Thagaval</span>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setIsBookmarkView(v => !v)}
            title="Saved bookmarks"
            className="thag-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 11px', borderRadius: '999px',
              fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
              ...(isBookmarkView
                ? { border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.14)', color: '#f59e0b', fontWeight: 600 }
                : { border: '1px solid var(--border)', background: 'var(--glass)', color: bookmarks.length > 0 ? '#f59e0b' : 'var(--text-muted)' })
            }}
          >
            <Bookmark size={13} fill={isBookmarkView ? 'currentColor' : bookmarks.length > 0 ? '#f59e0b' : 'none'} />
            {bookmarks.length > 0 && <span style={{ fontSize: '11px' }}>{bookmarks.length}</span>}
          </button>

          {/* Always-visible search — no toggle, no separate open/closed mode.
              Live-searches ~300ms after typing stops (see the debounce effect above);
              Enter fires immediately, and clearing the query returns to the feed. */}
          <div style={{ position: 'relative', width: '220px', flexShrink: 0 }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchQuery); if (e.key === 'Escape') clearSearch() }}
              placeholder="Search articles…"
              className="thag-search"
              style={{
                width: '100%', padding: '7px 28px 7px 30px', borderRadius: '999px',
                border: '1px solid var(--border)', background: 'var(--glass)',
                color: 'var(--text-1)', fontSize: '12.5px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
            {searchQuery && (
              <button onClick={clearSearch} title="Clear search"
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setSettingsOpen(true)}
            title="Feed preferences — choose sources and topics"
            aria-label="Feed preferences"
            className="thag-btn"
            style={{
              background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', color: 'var(--text-2)',
              padding: '7px 9px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', transition: 'all 0.2s',
            }}
          >
            <Settings size={14} />
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Fetch latest articles"
            className="thag-btn"
            style={{
              background: refreshing ? 'var(--glass)' : 'color-mix(in srgb, var(--app-thagaval) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--app-thagaval) 45%, var(--border))', borderRadius: 'var(--radius-sm)',
              cursor: refreshing ? 'not-allowed' : 'pointer', color: 'var(--app-thagaval)',
              fontSize: '13px', padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600,
              opacity: refreshing ? 0.6 : 1, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px',
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .thag-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
        @media (max-width: 639px) { .thag-grid { grid-template-columns: 1fr; } }
        .thag-card { transition: transform .28s cubic-bezier(.2,.7,.2,1), box-shadow .28s cubic-bezier(.2,.7,.2,1), border-color .28s, opacity .15s; }
        .thag-card:hover { transform: translateY(-4px); box-shadow: var(--sh-3); }
        .thag-title:hover { text-decoration: underline; text-underline-offset: 2px; }
        /* Clamp un-expanded summaries to a few lines so cards read as a tidy grid. */
        .thag-summary { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        /* Actions stay subtle at rest and come forward when the card is hovered/focused. */
        .thag-actions { opacity: .62; transition: opacity .2s; }
        .thag-card:hover .thag-actions, .thag-card:focus-within .thag-actions { opacity: 1; }
        .thag-pill { transition: transform .2s cubic-bezier(.2,.7,.2,1), background .2s, border-color .2s, color .2s, box-shadow .2s; }
        .thag-pill:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--app-thagaval) 45%, var(--border)); }
        .thag-btn:hover { border-color: color-mix(in srgb, var(--app-thagaval) 55%, var(--border)); transform: translateY(-1px); }
        .thag-search:focus { border-color: var(--app-thagaval); box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-thagaval) 18%, transparent); }
        @media (prefers-reduced-motion: reduce) {
          .thag-card, .thag-pill, .thag-btn { transition: none; }
          .thag-card:hover, .thag-pill:hover, .thag-btn:hover { transform: none; }
        }
      `}</style>

      <div className="thagaval-body" style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Left filter rail — Sources, then Topics, with a Collapse/Expand
            control pinned to its own bottom rather than living in the top bar. */}
        <aside className="thagaval-rail" style={{
          width: railOpen ? '236px' : '48px',
          flexShrink: 0,
          position: 'sticky',
          top: '44px',
          alignSelf: 'flex-start',
          height: 'calc(100vh - 44px)',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}>
          {railOpen ? (
            <>
              <div className="thagaval-rail-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 12px' }}>
                <FilterGroup title="Sources" canClear={activeSources.length > 0} onClear={() => setActiveSources([])}>
                  {railSources.map(s => (
                    <FilterPill
                      key={s.key}
                      label={s.label}
                      hue={SOURCE_CONFIG[s.key]?.color}
                      icon={<img src={`/icons/${s.key}.svg`} alt="" style={{ width: 13, height: 13, borderRadius: 2 }} />}
                      active={activeSources.includes(s.key)}
                      hint={!activeSources.includes(s.key) && !isBookmarkView && scrollSection === s.key}
                      count={grouped[s.key]?.length}
                      onToggle={() => toggleSource(s.key)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup title="Topics" canClear={activeTopics.length > 0} onClear={() => setActiveTopics([])}>
                  {railTopics.map(t => (
                    <FilterPill
                      key={t}
                      label={t}
                      active={activeTopics.includes(t)}
                      onToggle={() => setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    />
                  ))}
                </FilterGroup>
              </div>
              <button
                onClick={() => setRailOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px 18px', width: '100%', flexShrink: 0,
                  border: 'none', borderTop: '1px solid var(--border)',
                  background: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: '12.5px', fontFamily: 'inherit',
                }}
              >
                <PanelLeftClose size={15} />
                Collapse
              </button>
            </>
          ) : (
            <button
              onClick={() => setRailOpen(true)}
              title="Expand filters"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 0', width: '100%', flexShrink: 0, marginTop: 'auto',
                border: 'none', borderTop: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
        </aside>

        <main style={{ flex: 1, minWidth: 0, padding: '18px 20px' }}>
          <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          {/* Search results view */}
          {showingSearch && (
            <>
              {(searching || searchMode) && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  {searching
                    ? 'Searching…'
                    : `${searchMode === 'semantic' ? '✦ Semantic search via PlatformAI' : '⌕ Keyword match'} — ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                </p>
              )}
              {!searching && searchMode !== null && searchResults.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No matching articles found.</p>
              )}
              <div className="thag-grid">
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
              </div>
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
                  No articles yet — hit <strong>Refresh</strong> to fetch your feed.<br />
                  Use the <strong>gear</strong> to choose which sources and topics it pulls from.
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

      {settingsOpen && (
        <FeedSettings
          onClose={() => setSettingsOpen(false)}
          onSaved={next => setPrefs(next)}
        />
      )}
    </div>
  )
}
