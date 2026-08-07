/**
 * Central mapping from the app's interest areas to native API concepts for
 * each source, and to keyword lists for sources that have no topic API.
 *
 * Keep this file as the single source of truth — update it when you add a
 * new source or want to broaden/narrow what gets scraped.
 */

// ── Native API mappings ────────────────────────────────────────────────────

/** Dev.to tag slugs to pull.  Passed as `?tag=<tag>` per request. */
export const DEVTO_TAGS = [
  'ai',
  'machinelearning',
  'llm',
  'deeplearning',
  'datascience',
  'artificialintelligence',
]

/** Dev.to articles per tag (total fetched = DEVTO_TAGS × this). */
export const DEVTO_PER_TAG = 8

/** arXiv RSS category feeds — all map directly to our interest areas. */
export const ARXIV_FEEDS = [
  'https://export.arxiv.org/rss/cs.AI',   // Artificial Intelligence
  'https://export.arxiv.org/rss/cs.LG',   // Machine Learning
  'https://export.arxiv.org/rss/cs.CL',   // Computation & Language (NLP / LLMs)
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
]

/** Medium items kept per tag. */
export const MEDIUM_PER_TAG = 10

/** Reddit subreddits — ML/AI focused, ordered roughly by signal quality. */
export const REDDIT_SUBS = [
  'MachineLearning',
  'LocalLLaMA',
  'artificial',
  'LanguageModel',
]

/** Reddit posts kept per subreddit. */
export const REDDIT_PER_SUB = 8

// ── Keyword pre-filter (HN, Lobsters) ─────────────────────────────────────
// Sources that expose no topic API are fetched in full, then filtered by title
// before being sent to the LLM classifier — reducing API calls and token use.

const KEYWORDS = [
  // General AI
  'artificial intelligence', ' ai ', 'neural network', 'foundation model', 'inference engine',
  // ML
  'machine learning', ' ml ', 'fine-tun', 'dataset', 'benchmark', 'model training', 'evaluation',
  // Deep learning
  'deep learning', 'attention mechanism', 'self-attention', 'backprop',
  // LLMs
  'llm', 'large language model', 'language model', 'gpt', 'claude', 'gemini',
  'llama', 'mistral', 'qwen', 'chatbot', 'anthropic', 'openai',
  // Transformers
  'transformer', 'bert', 'tokenizer', 'embedding',
  // Coding agents / agentic AI
  'coding agent', 'code agent', 'code generation', 'copilot', 'devin',
  'agentic', 'agent framework', 'software agent', 'ai assistant',
  // RL
  'reinforcement learning', ' rlhf', 'reward model', 'policy gradient', ' dpo', ' ppo',
  // Data science
  'data science', 'data engineering', 'predictive model',
]

/**
 * Returns true if the title is plausibly on-topic for our interest areas.
 * Used to pre-filter HN and Lobsters before sending titles to the LLM classifier.
 * Errs on the side of inclusion — the classifier is the authoritative filter.
 */
export function matchesTopics(title: string): boolean {
  const lower = ` ${title.toLowerCase()} `
  return KEYWORDS.some(kw => lower.includes(kw))
}
