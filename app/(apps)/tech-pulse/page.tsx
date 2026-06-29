'use client'

import { useEffect, useState } from 'react'

type Source = 'all' | 'hn' | 'reddit' | 'devto' | 'medium' | 'huggingface' | 'arxiv' | 'lobsters' | 'pragmatic'

const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

interface Article {
  id: string
  source: Source
  title: string
  url: string
  score: number
  comment_count: number
  subreddit: string | null
  author: string | null
  fetched_at: string
  summary: string | null
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

function ArticleCard({ article }: { article: Article }) {
  const [summary, setSummary] = useState<string | null>(article.summary)
  const [expanded, setExpanded] = useState(!!article.summary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

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
        <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexShrink: 0 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', textDecoration: 'none', opacity: 1, transition: 'opacity 0.15s' }}
          >
            ↗
          </a>
          <button
            onClick={handleSummarize}
            disabled={loading}
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit', opacity: loading ? 0.4 : 1, transition: 'opacity 0.15s' }}
          >
            {loading ? '…' : summary && expanded ? '✦ hide' : '✦ AI'}
          </button>
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

function SourceSection({ source, articles }: { source: string; articles: Article[] }) {
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
      {articles.map(a => <ArticleCard key={a.id} article={a} />)}
    </section>
  )
}

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<Source>('all')
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scrollSection, setScrollSection] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/refresh', { method: 'POST' })
      const topicsParam = activeTopics.length > 0 ? `&topics=${activeTopics.map(encodeURIComponent).join(',')}` : ''
      const res = await fetch(`/api/feed?source=${activeTab}${topicsParam}`)
      const data = await res.json()
      setArticles(data.articles ?? [])
    } catch { /* silent */ } finally {
      setRefreshing(false)
    }
  }

  const [activeTopics, setActiveTopics] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem('tech-pulse-topics') ?? '[]')
    } catch { return [] }
  })
  useEffect(() => {
    localStorage.setItem('tech-pulse-topics', JSON.stringify(activeTopics))
  }, [activeTopics])

  useEffect(() => {
    setLoading(true)
    const topicsParam = activeTopics.length > 0 ? `&topics=${activeTopics.map(encodeURIComponent).join(',')}` : ''
    fetch(`/api/feed?source=${activeTab}${topicsParam}`)
      .then(r => r.json())
      .then(data => { setArticles(data.articles ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeTab, activeTopics])

  // Scroll spy: track which source section is in view when on 'all' tab
  useEffect(() => {
    if (activeTab !== 'all') {
      setScrollSection(null)
      return
    }
    const HEADER_OFFSET = 116 // 36 + 36 + 40 + 4 buffer
    const handleScroll = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-source-section]'))
      let current: string | null = null
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= HEADER_OFFSET) {
          current = section.dataset.source ?? null
        }
      }
      setScrollSection(current)
    }
    const scrollEl = document.querySelector('main') ?? window
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [activeTab, articles])

  const grouped = articles.reduce<Record<string, Article[]>>((acc, a) => {
    if (!acc[a.source]) acc[a.source] = []
    acc[a.source].push(a)
    return acc
  }, {})

  const sourceOrder: Source[] = ['hn', 'reddit', 'devto', 'medium', 'huggingface', 'arxiv', 'lobsters', 'pragmatic']
  const visibleSources = activeTab === 'all'
    ? sourceOrder.filter(s => (grouped[s]?.length ?? 0) > 0)
    : [activeTab].filter(s => (grouped[s]?.length ?? 0) > 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Row 1: App name only */}
      <div
        className="sticky top-0 z-10"
        style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '36px' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Tech Pulse
          </span>
        </div>
      </div>

      {/* Row 2: Topic filter pills + date/time */}
      <div
        className="sticky z-10"
        style={{ top: '37px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}>
          <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {TOPICS.map(t => (
              <TopicBubble
                key={t}
                topic={t}
                active={activeTopics.includes(t)}
                onToggle={() => setActiveTopics(prev =>
                  prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                )}
              />
            ))}
            {activeTopics.length > 0 && (
              <button
                onClick={() => setActiveTopics([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'inherit' }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', fontFamily: "'SF Mono', 'Menlo', 'Cascadia Code', monospace", fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Source tabs + refresh */}
      <div
        className="sticky z-10"
        style={{ top: '74px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
          <div style={{ display: 'flex', gap: '2px', flex: 1, alignItems: 'center' }}>
          {TABS.map(t => {
            const isActive = activeTab === t.key
            const isScrolled = activeTab === 'all' && scrollSection === t.key
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 14px', borderRadius: '999px',
                  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                  transition: 'all 0.15s',
                  ...(isActive
                    ? { border: 'none', background: 'var(--text-primary)', color: 'var(--bg)', fontWeight: 600 }
                    : isScrolled
                    ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 500 }
                    : { border: 'none', background: 'transparent', color: 'var(--text-secondary)' })
                }}
              >
                {t.key !== 'all' && (
                  <img src={`/icons/${t.key}.svg`} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} />
                )}
                {t.label}
              </button>
            )
          })}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Fetch latest articles"
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
              cursor: refreshing ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)',
              fontSize: '13px', padding: '4px 9px', fontFamily: 'inherit',
              opacity: refreshing ? 0.5 : 1, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
            }}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
            <span style={{ fontSize: '12px' }}>{refreshing ? 'Fetching…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>
        {loading && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</p>
        )}
        {!loading && articles.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            No articles yet — the first fetch runs at 8am UTC.<br />
            You can also run it manually: <code>npx tsx scripts/fetch.ts</code>
          </p>
        )}
        {!loading && visibleSources.map(s => (
          <SourceSection key={s} source={s} articles={grouped[s] ?? []} />
        ))}
      </main>
    </div>
  )
}
