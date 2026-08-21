/**
 * Central mapping from the app's interest areas to native API concepts for
 * each source, and to keyword lists for sources that have no topic API.
 *
 * Keep this file as the single source of truth — update it when you add a
 * new source or want to broaden/narrow what gets scraped.
 */

/**
 * The interest areas every article is classified against. Owned here rather
 * than in lib/classifier.ts because the keyword tables below key off it, and
 * classifier.ts imports from this file — putting TOPICS there would make the
 * two modules mutually dependent at runtime. classifier.ts re-exports it so
 * `import { TOPICS } from '@/lib/classifier'` keeps working.
 */
export const TOPICS: string[] = [
  'AI', 'Machine Learning', 'Deep Learning', 'LLMs', 'Transformers',
  'AI Coding Tools', 'Agentic AI', 'AI in SDLC', 'Latest Models',
  'Reinforcement Learning', 'Data Science',
]

// ── Native API mappings ────────────────────────────────────────────────────

/** Dev.to tag slugs to pull.  Passed as `?tag=<tag>` per request. */
export const DEVTO_TAGS = [
  'ai',
  'machinelearning',
  'llm',
  'deeplearning',
  'datascience',
  'artificialintelligence',
  'copilot',      // AI Coding Tools
  'aiagents',     // Agentic AI
  'aitesting',    // AI in SDLC
]

/** Dev.to articles per tag (total fetched = DEVTO_TAGS × this). */
export const DEVTO_PER_TAG = 8

/** arXiv RSS category feeds — all map directly to our interest areas. */
export const ARXIV_FEEDS = [
  'https://export.arxiv.org/rss/cs.AI',   // Artificial Intelligence
  'https://export.arxiv.org/rss/cs.LG',   // Machine Learning
  'https://export.arxiv.org/rss/cs.CL',   // Computation & Language (NLP / LLMs)
  'https://export.arxiv.org/rss/cs.MA',   // Multiagent Systems (Agentic AI)
  'https://export.arxiv.org/rss/cs.SE',   // Software Engineering (AI in SDLC)
]

/** arXiv items kept per feed. */
export const ARXIV_PER_FEED = 12

/** Medium RSS tag slugs.  Pulled as `/feed/tag/<slug>`. */
export const MEDIUM_TAGS = [
  'artificial-intelligence',
  'machine-learning',
  'deep-learning',
  'llm',
  'data-science',
  'github-copilot', // AI Coding Tools
  'ai-agents',      // Agentic AI
  'ai-testing',     // AI in SDLC
]

/** Medium items kept per tag. */
export const MEDIUM_PER_TAG = 10

/** Reddit subreddits — ML/AI focused, ordered roughly by signal quality. */
export const REDDIT_SUBS = [
  'MachineLearning',
  'LocalLLaMA',
  'artificial',
  'LanguageModel',
  'AI_Agents',      // Agentic AI
  'ChatGPTCoding',  // AI Coding Tools
]

/** Reddit posts kept per subreddit. */
export const REDDIT_PER_SUB = 8

// ── Keyword tables ────────────────────────────────────────────────────────
// These serve two different jobs with two different precision requirements:
//
//   keywordTopics()  ASSIGNS topics that are shown to the reader and drive the
//                    topic filter pills. Wants precision — a wrong tag is worse
//                    than a missing one.
//   matchesTopics()  PRE-FILTERS HN and Lobsters (sources with no topic API)
//                    before classification. Wants recall — it only decides what
//                    is worth looking at more closely.
//
// So the per-topic table below feeds both, and WEAK_KEYWORDS adds recall to the
// pre-filter only. 'benchmark' is the motivating case: it belongs in a net cast
// over raw HN, but tagging a Rust microbenchmark post as "Machine Learning"
// would be plainly wrong.

/** Per-topic keywords. Every key must be a member of TOPICS. */
export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'AI': [
    'artificial intelligence', ' ai ', 'neural network', 'foundation model',
    'inference engine',
  ],
  'Machine Learning': [
    'machine learning', ' ml ', 'fine-tun', 'fine tun', 'model training',
    'supervised learning', 'unsupervised learning', 'feature engineering',
  ],
  'Deep Learning': [
    'deep learning', 'attention mechanism', 'self-attention', 'backprop',
    'gradient descent', 'convolutional', 'optimizer',
  ],
  'LLMs': [
    'llm', 'large language model', 'language model', 'gpt', 'claude', 'gemini',
    'llama', 'mistral', 'qwen', 'chatbot', 'anthropic', 'openai',
    'prompt engineering', 'context window', 'hallucinat',
  ],
  'Transformers': [
    'transformer', 'bert', 'tokenizer', 'tokenization', 'embedding',
  ],
  'AI Coding Tools': [
    'coding agent', 'code agent', 'code generation', 'copilot', 'devin',
    'ai assistant', 'cursor', 'claude code', 'code completion',
    'pair programming', 'ai coding', 'code review assistant',
  ],
  'Agentic AI': [
    'agentic', 'agentic ai', 'ai agent', 'autonomous agent', 'multi-agent',
    'agent framework', 'agent orchestration', 'software agent', 'tool use',
    'agentic workflow', 'reasoning agent', 'mcp server',
  ],
  'AI in SDLC': [
    'sdlc', 'software development lifecycle', 'ai code review',
    'automated code review', 'test generation', 'ai testing',
    'ci/cd', 'devops automation', 'requirements engineering',
    'ai in software engineering', 'software engineering ai',
  ],
  'Latest Models': [
    'gpt-4', 'gpt-5', 'claude 3', 'claude 4', 'claude opus', 'claude sonnet',
    'gemini 2', 'gemini 3', 'llama 3', 'llama 4', 'deepseek', 'qwen3',
    'grok', 'sota', 'state-of-the-art', 'state of the art',
  ],
  'Reinforcement Learning': [
    'reinforcement learning', ' rlhf', 'reward model', 'policy gradient',
    ' dpo', ' ppo',
  ],
  'Data Science': [
    'data science', 'data engineering', 'predictive model', 'data pipeline',
  ],
}

/**
 * Recall-only terms for the HN/Lobsters pre-filter. Too generic to tag with,
 * specific enough to be worth a closer look.
 */
const WEAK_KEYWORDS = ['dataset', 'benchmark', 'evaluation', 'quantiz', 'diffusion model']

/**
 * Topics that are subfields of AI, so matching one also implies 'AI'. This is
 * what makes the 'AI' pill behave as a superset rather than as a ninth sibling
 * that only fires on the literal words "artificial intelligence".
 *
 * Data Science is deliberately absent: a data-pipeline post is not AI work.
 */
const IMPLIES_AI = [
  'Machine Learning', 'Deep Learning', 'LLMs', 'Transformers',
  'AI Coding Tools', 'Agentic AI', 'AI in SDLC', 'Latest Models',
  'Reinforcement Learning',
]

/**
 * Two views of the same title, because the keyword tables mix both shapes.
 *
 *   raw  — lowercased and space-padded, punctuation intact, so hyphenated
 *          keywords ('fine-tun', 'gpt-4', 'state-of-the-art') can match.
 *   norm — punctuation collapsed to spaces, so space-padded keywords like
 *          ' ai ' match "AI-powered" and "(AI)" instead of silently missing.
 *
 * A keyword hits if it appears in either.
 */
function views(title: string): [string, string] {
  const raw = ` ${title.toLowerCase()} `
  return [raw, ` ${raw.replace(/[^a-z0-9]+/g, ' ').trim()} `]
}

function hits(keywords: string[], raw: string, norm: string): boolean {
  return keywords.some(kw => raw.includes(kw) || norm.includes(kw))
}

/**
 * Assigns topics from the title alone, with no network call.
 *
 * This is the fallback the LLM classifier degrades to. It exists so that an
 * unreachable model host costs you accuracy, not the entire feature: topic
 * pills keep filtering and matched topics keep rendering.
 */
export function keywordTopics(title: string): string[] {
  const [raw, norm] = views(title)
  const matched = TOPICS.filter(t => hits(TOPIC_KEYWORDS[t] ?? [], raw, norm))
  if (!matched.includes('AI') && matched.some(t => IMPLIES_AI.includes(t))) {
    matched.unshift('AI')
  }
  return matched
}

/**
 * Returns true if the title is plausibly on-topic for our interest areas.
 * Used to pre-filter HN and Lobsters before sending titles to the classifier.
 * Errs on the side of inclusion — classification is the authoritative filter.
 */
export function matchesTopics(title: string): boolean {
  const [raw, norm] = views(title)
  if (hits(WEAK_KEYWORDS, raw, norm)) return true
  return TOPICS.some(t => hits(TOPIC_KEYWORDS[t] ?? [], raw, norm))
}
