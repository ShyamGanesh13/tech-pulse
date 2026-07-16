import * as cheerio from 'cheerio'
import type { UraiSource } from './types'

export interface SearchResult extends UraiSource {
  snippet: string
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/**
 * Parse DuckDuckGo HTML-endpoint markup into results.
 * Exported (and pure) so it can be unit-tested against a fixture.
 */
export function parseDdgHtml(html: string, limit = 5): SearchResult[] {
  const $ = cheerio.load(html)
  const results: SearchResult[] = []

  $('.result').each((_, el) => {
    if (results.length >= limit) return
    if ($(el).hasClass('result--ad')) return // skip sponsored rows
    const a = $(el).find('a.result__a').first()
    const title = a.text().trim()
    if (!title) return

    let url = a.attr('href') ?? ''
    // DDG wraps outbound links as //duckduckgo.com/l/?uddg=<encoded>&...
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg) url = decodeURIComponent(uddg[1])
    else if (url.startsWith('//')) url = 'https:' + url
    // Drop anything that isn't a real outbound http(s) link (e.g. DDG y.js ads)
    if (!/^https?:\/\//.test(url) || /(^|\.)duckduckgo\.com\//.test(url)) return

    const snippet = $(el).find('.result__snippet').first().text().trim()
    results.push({ title, url, snippet })
  })

  return results
}

async function ddgSearch(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ q: query }).toString(),
  })
  if (!res.ok) return []
  const html = await res.text()
  return parseDdgHtml(html, limit)
}

interface BraveWebResult {
  title: string
  url: string
  description?: string
}

async function braveSearch(query: string, limit: number): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY!
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  })
  if (!res.ok) return []
  const data = await res.json()
  const web: BraveWebResult[] = data?.web?.results ?? []
  return web.slice(0, limit).map(r => ({
    title: r.title,
    url: r.url,
    snippet: (r.description ?? '').replace(/<[^>]+>/g, ''),
  }))
}

/**
 * Search the web. Uses Brave when BRAVE_SEARCH_API_KEY is set (reliable,
 * works through proxies); otherwise falls back to scraping DuckDuckGo
 * (no key, but can be blocked by some networks). Never throws — returns
 * [] on any failure so the model can answer without search.
 */
export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  try {
    if (process.env.BRAVE_SEARCH_API_KEY) return await braveSearch(query, limit)
    return await ddgSearch(query, limit)
  } catch {
    return []
  }
}
