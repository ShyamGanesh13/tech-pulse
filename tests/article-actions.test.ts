import { describe, it, expect } from 'bun:test'
import { articleNoteHtml, uraiAskHref, uraiAskPrompt, URAI_ASK_PARAM } from '@/lib/article-actions'

describe('article-actions', () => {
  it('escapes untrusted article text in the note body', () => {
    const html = articleNoteHtml({
      title: '<img src=x onerror=alert(1)> & "more"',
      url: 'https://example.com/a?b=1&c="2"',
      sourceLabel: 'Hacker News',
      summary: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('<h2>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;more&quot;</h2>')
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=&quot;2&quot;">')
    expect(html).toContain('<p>Source: Hacker News</p>')
  })

  it('never links a non-http URL and omits a missing summary', () => {
    const html = articleNoteHtml({ title: 't', url: 'javascript:alert(1)', sourceLabel: 's', summary: null })
    expect(html).not.toContain('href')
    expect(html).toBe('<h2>t</h2><p>javascript:alert(1)</p><p>Source: s</p>')
  })

  it('round-trips the Urai prompt through the query string', () => {
    const a = { title: 'A & B? #1 = 100% "new"', url: 'https://example.com/x?y=1&z=2#frag' }
    const href = uraiAskHref(a)
    const u = new URL(href, 'https://app.test')
    expect(u.pathname).toBe('/urai')
    expect([...u.searchParams.keys()]).toEqual([URAI_ASK_PARAM])
    expect(u.searchParams.get(URAI_ASK_PARAM)).toBe(uraiAskPrompt(a))
  })
})
