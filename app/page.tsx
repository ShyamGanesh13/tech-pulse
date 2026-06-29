'use client'

import { useEffect, useState } from 'react'

type Source = 'all' | 'hn' | 'reddit' | 'devto' | 'medium'

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
  hn:     { label: 'Hacker News', color: '#FF6600' },
  reddit: { label: 'Reddit',      color: '#FF4500' },
  devto:  { label: 'Dev.to',      color: '#3D3D3D' },
  medium: { label: 'Medium',      color: '#02B875' },
}

const TABS: { key: Source; label: string }[] = [
  { key: 'all',    label: 'All'     },
  { key: 'hn',     label: 'HN'      },
  { key: 'reddit', label: 'Reddit'  },
  { key: 'devto',  label: 'Dev.to'  },
  { key: 'medium', label: 'Medium'  },
]

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
          <div className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {article.title}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {metaParts}
          </div>
        </div>
        <div className="flex gap-1.5 ml-2 shrink-0">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            className="text-xs px-2 py-1 rounded hover:opacity-70 transition-opacity"
          >
            ↗
          </a>
          <button
            onClick={handleSummarize}
            disabled={loading}
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            className="text-xs px-2 py-1 rounded hover:opacity-70 transition-opacity disabled:opacity-40"
          >
            {loading ? '…' : summary && expanded ? '✦ hide' : '✦ AI'}
          </button>
        </div>
      </div>

      {expanded && summary && (
        <div
          className="mt-3 pt-3 text-sm rounded p-3"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
          }}
        >
          {summary}
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs" style={{ color: '#ef4444' }}>
          Summary unavailable — try again.
        </div>
      )}
    </div>
  )
}

function SourceSection({ source, articles }: { source: string; articles: Article[] }) {
  const config = SOURCE_CONFIG[source]
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: config.color }} className="text-sm leading-none select-none">●</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
          {config.label}
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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

  useEffect(() => {
    setLoading(true)
    fetch(`/api/feed?source=${activeTab}`)
      .then(r => r.json())
      .then(data => { setArticles(data.articles ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeTab])

  const grouped = articles.reduce<Record<string, Article[]>>((acc, a) => {
    if (!acc[a.source]) acc[a.source] = []
    acc[a.source].push(a)
    return acc
  }, {})

  const sourceOrder: Source[] = ['hn', 'reddit', 'devto', 'medium']
  const visibleSources = activeTab === 'all'
    ? sourceOrder.filter(s => (grouped[s]?.length ?? 0) > 0)
    : [activeTab].filter(s => (grouped[s]?.length ?? 0) > 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header
        className="sticky top-0 z-10 px-4 py-3"
        style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="max-w-[720px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Tech Pulse
          </span>
          <nav className="flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={
                  activeTab === t.key
                    ? { background: 'var(--text-primary)', color: 'var(--bg)', fontWeight: 600 }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-6">
        {loading && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        )}
        {!loading && articles.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
