import { groupStories } from './story-groups'
import { topStories } from './top-stories'
import { DIGEST_SOURCES } from './source-registry'
import type { Article } from './types'

/**
 * Builds the Thagaval morning-digest push from a tenant's stored feed.
 *
 * Pure. Uses exactly the grouping and ranking behind the in-app "Top today"
 * strip, so the notification and the page cannot disagree. Returns null when
 * nothing is on-topic — the caller skips the push rather than send an empty one.
 */

export const DIGEST_STORIES = 5
/** Per-headline cap: five lines of this still fit an expanded notification. */
const MAX_TITLE = 70

export interface DigestPayload {
  title: string
  body: string
  tag: string
  url: string
}

/** YYYY-MM-DD in IST — the digest's notion of "today" (en-CA formats as ISO). */
export function istDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function buildDigest(
  articles: Pick<Article, 'id' | 'source' | 'title' | 'url' | 'topics' | 'relevance' | 'score'>[],
  day: string = istDate(),
): DigestPayload | null {
  const top = topStories(groupStories(articles, DIGEST_SOURCES), DIGEST_STORIES, DIGEST_SOURCES)
  if (top.length === 0) return null
  return {
    title: 'Thagaval — top stories',
    body: top.map(s => {
      const t = s.title.trim()
      return `• ${t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t}`
    }).join('\n'),
    // One tag per day: if a digest is ever sent twice, the second replaces the
    // first on the device instead of stacking.
    tag: `thagaval-digest-${day}`,
    url: '/thagaval',
  }
}
