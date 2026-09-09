/**
 * Validation and defaults for a tenant's feed subscription.
 *
 * Shared by both datastore backends and the API route rather than written three
 * times. The stakes are higher than they look: these values are inlined into
 * ZCQL on Catalyst (which has no parameter binding), so the allowlist here is
 * load-bearing security, not tidiness.
 */
import { SOURCE_KEYS, isSource } from './source-registry'
import { TOPICS } from './topic-map'
import type { FeedPrefs, Source } from './types'

/**
 * What a tenant with no stored row gets: everything.
 *
 * Computed on read and NOT written on first login — a new Google sign-in
 * shouldn't cost a write, and this way a source added to the registry is
 * automatically enabled for anyone who never customised their selection.
 */
export function defaultFeedPrefs(): FeedPrefs {
  return { sources: [...SOURCE_KEYS], topics: [...TOPICS] }
}

const TOPIC_SET: ReadonlySet<string> = new Set(TOPICS)

export function isTopic(value: unknown): value is string {
  return typeof value === 'string' && TOPIC_SET.has(value)
}

/**
 * Coerces whatever is in storage into something safe to use.
 *
 * Drops anything no longer in the catalog, so retiring a source or topic cannot
 * break the feed of a tenant who had it selected. An empty result after
 * filtering falls back to the default rather than to nothing — an empty list
 * would mean "fetch nothing, show nothing", which is indistinguishable from a
 * broken app and is not a state a stale row should be able to produce.
 */
export function sanitizeFeedPrefs(raw: { sources?: unknown; topics?: unknown } | null): FeedPrefs {
  const fallback = defaultFeedPrefs()
  if (!raw) return fallback

  const sources = Array.isArray(raw.sources) ? raw.sources.filter(isSource) : []
  const topics = Array.isArray(raw.topics) ? raw.topics.filter(isTopic) : []

  return {
    sources: sources.length > 0 ? dedupe(sources) : fallback.sources,
    topics: topics.length > 0 ? dedupe(topics) : fallback.topics,
  }
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

export type ValidationResult =
  | { ok: true; prefs: FeedPrefs }
  | { ok: false; error: string }

/**
 * Validates a request body. Unlike sanitizeFeedPrefs this REJECTS rather than
 * repairs: a user actively saving a selection deserves to be told their input
 * was wrong, whereas a stale stored row should degrade quietly.
 */
export function validateFeedPrefs(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be an object' }
  const { sources, topics } = body as { sources?: unknown; topics?: unknown }

  if (!Array.isArray(sources) || !Array.isArray(topics)) {
    return { ok: false, error: 'Both `sources` and `topics` must be arrays' }
  }

  const badSource = sources.find(s => !isSource(s))
  if (badSource !== undefined) return { ok: false, error: `Unknown source: ${String(badSource)}` }

  const badTopic = topics.find(t => !isTopic(t))
  if (badTopic !== undefined) return { ok: false, error: `Unknown topic: ${String(badTopic)}` }

  // Zero of either means an empty fetch AND an empty feed. Rejected here so the
  // settings panel can explain it, instead of the tenant discovering a blank
  // page after a refresh that appeared to succeed.
  if (sources.length === 0) return { ok: false, error: 'Select at least one source' }
  if (topics.length === 0) return { ok: false, error: 'Select at least one topic' }

  return { ok: true, prefs: { sources: dedupe(sources as Source[]), topics: dedupe(topics as string[]) } }
}
