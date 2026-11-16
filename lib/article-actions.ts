// Cross-app hand-offs from a Thagaval article card. Article titles, URLs and
// summaries are untrusted text from the internet: Kuripu renders note content
// with innerHTML, so everything that goes into a note is escaped here.

interface ArticleRef {
  title: string
  url: string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Kuripu note body (HTML, the format its contentEditable editor stores). */
export function articleNoteHtml(a: ArticleRef & { sourceLabel: string; summary?: string | null }): string {
  // Only http(s) becomes a link — a javascript: URL must never reach an href.
  const link = /^https?:\/\//i.test(a.url)
    ? `<a href="${esc(a.url)}">${esc(a.url)}</a>`
    : esc(a.url)
  // Notes cap at 10000 chars server-side; trim the summary so the cut never lands mid-tag.
  const summary = a.summary?.trim().slice(0, 4000)
  return (
    `<h2>${esc(a.title)}</h2>` +
    `<p>${link}</p>` +
    `<p>Source: ${esc(a.sourceLabel)}</p>` +
    (summary ? `<p>${esc(summary)}</p>` : '')
  )
}

/** Query parameter Urai reads once on mount to pre-fill (never send) its composer. */
export const URAI_ASK_PARAM = 'ask'

export function uraiAskPrompt(a: ArticleRef): string {
  return `${a.title}\n${a.url}\n\nSummarise this and tell me why it matters.`
}

export function uraiAskHref(a: ArticleRef): string {
  return `/urai?${URAI_ASK_PARAM}=${encodeURIComponent(uraiAskPrompt(a))}`
}
