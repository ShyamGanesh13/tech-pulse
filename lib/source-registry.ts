/**
 * The single catalog of feed sources: identity, presentation, and how each
 * source's native API maps onto the app's interest topics.
 *
 * WHY THIS FILE EXISTS: the same list used to be spelled out in four places —
 * the `Source` union in lib/types.ts, a `validSources` array in
 * app/api/feed/route.ts, and `SOURCES` plus `SOURCE_CONFIG` in the Thagaval
 * page (which also redeclared the union locally). Adding a source meant
 * remembering all four, and a source missing from `validSources` failed with a
 * 400 that named nothing.
 *
 * WHY THE TOPIC MAP LIVES HERE AND NOT IN COMMENTS: the topic each native tag
 * serves used to be a trailing comment (`'copilot', // AI Coding Tools`). Once
 * a user can pick topics, that relationship has to be queryable data — you
 * cannot intersect a comment with a preference set.
 *
 * IMPORT DIRECTION: this file imports TOPICS from ./topic-map and nothing else.
 * topic-map must never import back, or the keyword tables and the registry
 * become mutually dependent at runtime. lib/types.ts re-exports `Source` from
 * here so existing `import type { Source } from './types'` keeps working.
 *
 * CLIENT-SAFE: no server-only imports, so the Thagaval page and the settings
 * panel can both read the catalog directly instead of being handed it.
 */

/**
 * How a source narrows to a topic selection.
 *
 *   native  — has a tag/feed/subreddit API, so we request only the tags that
 *             serve the user's enabled topics.
 *   keyword — has no topic API, so we pull its general feed and pre-filter
 *             titles through matchesTopics() against the enabled topics.
 */
export type SourceTier = 'native' | 'keyword'

export interface SourceDef {
  /** Full name, used in article cards and the settings panel. */
  label: string
  /** Short name for the cramped left-rail filter pills. */
  shortLabel: string
  /** Spine/chip colour. Presentation lives here so the catalog is one object. */
  color: string
  tier: SourceTier
  /**
   * topic -> native tags serving it. Keys MUST be members of TOPICS; a typo
   * would silently map to nothing, so tests/source-registry.test.ts asserts it.
   * Absent on keyword-tier sources.
   */
  topicTags?: Record<string, string[]>
  /**
   * Requested when NONE of the user's enabled topics map to this source.
   *
   * Not a nicety: Transformers, Latest Models and Reinforcement Learning have
   * no native tag on ANY source, and Deep Learning and Data Science are missing
   * from several. Without a fallback, enabling only Transformers would resolve
   * an empty tag set and return zero articles from four of ten sources — a
   * legal preference combination producing an empty feed. The broad tag is
   * fetched instead and the post-classification filter narrows it.
   */
  defaultTags?: string[]
  /** Items kept per tag/feed/sub. Was a separate *_PER_* const per source. */
  perTag?: number
}

export const SOURCES = {
  hn: {
    label: 'Hacker News', shortLabel: 'HN', color: '#FF6600', tier: 'keyword',
  },
  reddit: {
    label: 'Reddit', shortLabel: 'Reddit', color: '#FF4500', tier: 'native',
    topicTags: {
      'AI': ['artificial'],
      'Machine Learning': ['MachineLearning'],
      'LLMs': ['LocalLLaMA', 'LanguageModel'],
      'Agentic AI': ['AI_Agents'],
      'AI Coding Tools': ['ChatGPTCoding'],
    },
    defaultTags: ['MachineLearning', 'artificial'],
    perTag: 8,
  },
  devto: {
    label: 'Dev.to', shortLabel: 'Dev.to', color: '#3D3D3D', tier: 'native',
    topicTags: {
      'AI': ['ai', 'artificialintelligence'],
      'Machine Learning': ['machinelearning'],
      'Deep Learning': ['deeplearning'],
      'LLMs': ['llm'],
      'Data Science': ['datascience'],
      'AI Coding Tools': ['copilot'],
      'Agentic AI': ['aiagents'],
      'AI in SDLC': ['aitesting'],
    },
    defaultTags: ['ai'],
    perTag: 8,
  },
  medium: {
    label: 'Medium', shortLabel: 'Medium', color: '#02B875', tier: 'native',
    topicTags: {
      'AI': ['artificial-intelligence'],
      'Machine Learning': ['machine-learning'],
      'Deep Learning': ['deep-learning'],
      'LLMs': ['llm'],
      'Data Science': ['data-science'],
      'AI Coding Tools': ['github-copilot'],
      'Agentic AI': ['ai-agents'],
      'AI in SDLC': ['ai-testing'],
    },
    defaultTags: ['artificial-intelligence'],
    perTag: 10,
  },
  huggingface: {
    label: 'Hugging Face', shortLabel: 'HF Papers', color: '#FFD21E', tier: 'keyword',
  },
  arxiv: {
    // Values are RSS category feed URLs rather than bare tags; fetchArxiv
    // consumes them directly, so resolveTags() stays source-agnostic.
    label: 'arXiv', shortLabel: 'arXiv', color: '#B31B1B', tier: 'native',
    topicTags: {
      'AI': ['https://export.arxiv.org/rss/cs.AI'],
      'Machine Learning': ['https://export.arxiv.org/rss/cs.LG'],
      'LLMs': ['https://export.arxiv.org/rss/cs.CL'],
      'Agentic AI': ['https://export.arxiv.org/rss/cs.MA'],
      'AI in SDLC': ['https://export.arxiv.org/rss/cs.SE'],
    },
    defaultTags: ['https://export.arxiv.org/rss/cs.AI'],
    perTag: 12,
  },
  lobsters: {
    label: 'Lobste.rs', shortLabel: 'Lobste.rs', color: '#AC130D', tier: 'keyword',
  },
  pragmatic: {
    label: 'Pragmatic Engineer', shortLabel: 'Pragmatic', color: '#E94560', tier: 'keyword',
  },
  simonwillison: {
    label: 'Simon Willison', shortLabel: 'Willison', color: '#4A90D9', tier: 'keyword',
  },
  githubblog: {
    label: 'GitHub Blog', shortLabel: 'GH Blog', color: '#6E40C9', tier: 'keyword',
  },
} as const satisfies Record<string, SourceDef>

/** Every source key. Derived, so it can never drift from SOURCES. */
export type Source = keyof typeof SOURCES

/**
 * Declaration order, which is also the left-rail and feed-section order.
 * Object key order is guaranteed for non-numeric string keys, so this needs no
 * separate ordering array to fall out of sync with.
 */
export const SOURCE_KEYS = Object.keys(SOURCES) as Source[]

/**
 * Own keys only, as a Set.
 *
 * NOT `value in SOURCES`: `in` walks the prototype chain, so 'toString',
 * 'constructor' and friends all report as valid sources. That matters because
 * this guard is what stands between a query string and a ZCQL `feed_source`
 * comparison, and between a request body and a stored preference.
 */
const SOURCE_KEY_SET: ReadonlySet<string> = new Set(SOURCE_KEYS)

/** Narrows unvalidated input — query strings, request bodies, stored prefs. */
export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && SOURCE_KEY_SET.has(value)
}

export function sourceDef(source: Source): SourceDef {
  return SOURCES[source]
}

/**
 * The native tags to request from `source` to serve `enabledTopics`.
 *
 * Returns [] for keyword-tier sources — they have nothing to narrow, and their
 * filtering happens on titles instead. Falls back to defaultTags when the
 * intersection is empty; see the note on SourceDef.defaultTags for why that
 * fallback is load-bearing rather than defensive.
 *
 * Order follows the source's own topicTags declaration, not the caller's topic
 * order, so the same preference set always produces the same request sequence.
 */
export function resolveTags(source: Source, enabledTopics: string[]): string[] {
  const def = SOURCES[source] as SourceDef
  if (def.tier === 'keyword' || !def.topicTags) return []

  const wanted = new Set(enabledTopics)
  const tags = new Set<string>()
  for (const [topic, topicTags] of Object.entries(def.topicTags)) {
    if (wanted.has(topic)) for (const tag of topicTags) tags.add(tag)
  }

  if (tags.size === 0) return [...(def.defaultTags ?? [])]
  return [...tags]
}
