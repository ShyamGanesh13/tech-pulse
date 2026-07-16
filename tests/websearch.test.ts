import { describe, it, expect } from 'bun:test'
import { parseDdgHtml } from '@/lib/websearch'

// Representative DuckDuckGo HTML-endpoint markup (outbound links are wrapped in
// the //duckduckgo.com/l/?uddg=<encoded> redirect, as DDG serves them).
const FIXTURE = `
<html><body>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnextjs.org%2Fblog%2Fnext-16&amp;rut=abc">Next.js 16 Release Notes</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnextjs.org%2Fblog%2Fnext-16">Next.js 16 introduces Turbopack by default and more.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FNext.js">Next.js - Wikipedia</a>
      <a class="result__snippet">A React framework for production.</a>
    </div>
  </div>
  <div class="result result--ad">
    <div class="links_main"><a class="result__a" href="//duckduckgo.com/y.js?ad">Sponsored</a></div>
  </div>
</body></html>
`

describe('parseDdgHtml', () => {
  it('extracts title, decoded url, and snippet', () => {
    const results = parseDdgHtml(FIXTURE)
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].title).toBe('Next.js 16 Release Notes')
    expect(results[0].url).toBe('https://nextjs.org/blog/next-16')
    expect(results[0].snippet).toContain('Turbopack')
  })

  it('decodes the second result url and tolerates a missing snippet href', () => {
    const results = parseDdgHtml(FIXTURE)
    expect(results[1].url).toBe('https://en.wikipedia.org/wiki/Next.js')
    expect(results[1].title).toBe('Next.js - Wikipedia')
  })

  it('respects the limit', () => {
    expect(parseDdgHtml(FIXTURE, 1)).toHaveLength(1)
  })

  it('excludes sponsored / DDG-internal links', () => {
    const urls = parseDdgHtml(FIXTURE).map(r => r.url)
    expect(urls.some(u => u.includes('duckduckgo.com'))).toBe(false)
    expect(urls).toHaveLength(2)
  })

  it('returns [] for empty/anomaly html', () => {
    expect(parseDdgHtml('<html><body>anomaly</body></html>')).toEqual([])
  })
})
