import { TOPICS, keywordTopics } from './topic-map'

// Re-exported so `import { TOPICS } from '@/lib/classifier'` keeps working for
// the Thagaval UI. The owning definition lives in lib/topic-map.ts alongside the
// keyword tables that key off it.
export { TOPICS }

const BATCH = 15
const OPENAI_MODEL = 'gpt-4o-mini'
const CALL_TIMEOUT_MS = 120_000

// A liveness probe, not a request budget: it only has to tell a listening host
// apart from an unroutable one, so it must be short. The old code went straight
// to a 120s classification call, so an unreachable host cost 120s PER BATCH —
// ~24 minutes of dead waiting for a 175-article refresh, all of it discarded.
const PROBE_TIMEOUT_MS = 2_500

type Backend =
  | { kind: 'ollama'; host: string; model: string }
  | { kind: 'openai'; key: string; model: string }

/** Which backend produced the topics, and how much of the corpus it covered. */
export interface Classification {
  /** Article id -> topics. Every requested id is present; empty array = no match. */
  topics: Map<string, string[]>
  /**
   * Ids an LLM actually returned a verdict for. Everything else is keyword-derived,
   * which is weaker evidence — the UI must not present an empty keyword result as
   * a considered "off-topic" judgement.
   */
  llmVerdicts: Set<string>
  backend: 'ollama' | 'openai' | 'none'
  mode: 'llm' | 'partial' | 'keyword'
  /** Human-readable reason the run was degraded. Absent on a clean LLM run. */
  note?: string
}

function extractJSON(text: string): string {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (block) return block[1]
  const start = Math.min(
    text.includes('[') ? text.indexOf('[') : Infinity,
    text.includes('{') ? text.indexOf('{') : Infinity,
  )
  return start === Infinity ? text : text.slice(start)
}

/**
 * Is the Ollama host actually routable from here?
 *
 * OLLAMA_HOST is typically a LAN address (a Mac Studio on 10.x). That resolves
 * fine from a laptop and not at all from a cloud runtime like AppSail, so
 * "configured" and "usable" are genuinely different questions and only this
 * answers the second one.
 */
async function ollamaReachable(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Picks the first backend that can actually be reached.
 *
 * Previously this was `ollamaHost ? ollama : openai`, so merely SETTING
 * OLLAMA_HOST disqualified OpenAI — on a deployment where the Ollama box is
 * unroutable that meant no classification at all, despite a working API key
 * sitting right there in the environment. Reachability decides now, not presence.
 */
async function pickBackend(): Promise<{ backend: Backend | null; note?: string }> {
  const host = process.env.OLLAMA_HOST?.replace(/\/$/, '')
  const key = process.env.OPENAI_API_KEY
  const openai: Backend | null = key ? { kind: 'openai', key, model: OPENAI_MODEL } : null

  if (host) {
    if (await ollamaReachable(host)) {
      return {
        backend: {
          kind: 'ollama',
          host,
          model: process.env.OLLAMA_CLASSIFY_MODEL ?? process.env.OLLAMA_MODEL ?? 'llama3',
        },
      }
    }
    if (openai) return { backend: openai, note: `Ollama at ${host} is unreachable — classified with OpenAI instead.` }
    return { backend: null, note: `Ollama at ${host} is unreachable and OPENAI_API_KEY is not set — fell back to keyword matching.` }
  }

  if (openai) return { backend: openai }
  return { backend: null, note: 'No AI backend configured — fell back to keyword matching.' }
}

async function classifyBatch(
  articles: { id: string; title: string }[],
  backend: Backend,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  const list = articles.map(a => `{"id":${JSON.stringify(a.id)},"title":${JSON.stringify(a.title)}}`).join('\n')

  const messages = [
    { role: 'system', content: 'You are a JSON classifier. Output only valid JSON — no explanation, no reasoning, no markdown.' },
    { role: 'user', content: `Classify each article against these topics: ${TOPICS.join(', ')}.
Reply with a JSON array only. Format: [{"id":"...","topics":["Topic1"]}]
Only include topics that clearly match. Use exact topic strings. Empty array if none match.

Articles:
${list}` },
  ]

  let raw = ''

  if (backend.kind === 'ollama') {
    // Native Ollama API — more reliable than /v1/chat/completions for thinking models
    const res = await fetch(`${backend.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: backend.model, stream: false, think: false, messages }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
    const data = await res.json()
    raw = data.message?.content?.trim() ?? ''
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${backend.key}` },
      body: JSON.stringify({ model: backend.model, max_tokens: 1024, messages }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
    const data = await res.json()
    raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  const parsed: { id: string; topics: string[] }[] = JSON.parse(extractJSON(raw))
  const wanted = new Set(articles.map(a => a.id))
  for (const item of parsed) {
    if (!wanted.has(item.id)) continue
    result.set(item.id, (item.topics ?? []).filter((t: string) => TOPICS.includes(t)))
  }
  return result
}

/**
 * Classifies articles against TOPICS, degrading rather than disappearing.
 *
 * Every id starts with keyword-derived topics, so a missing or unreachable model
 * host still yields usable topics instead of a silent blanket of empty arrays.
 * An LLM verdict overrides the keyword guess for the ids it covers, and the
 * caller learns from `llmVerdicts` / `mode` how much to trust an empty result.
 */
export async function classifyArticles(
  articles: { id: string; title: string }[],
): Promise<Classification> {
  const topics = new Map(articles.map(a => [a.id, keywordTopics(a.title)]))
  const llmVerdicts = new Set<string>()

  if (articles.length === 0) {
    return { topics, llmVerdicts, backend: 'none', mode: 'keyword' }
  }

  const { backend, note } = await pickBackend()
  if (!backend) {
    console.warn(`[classifier] ${note}`)
    return { topics, llmVerdicts, backend: 'none', mode: 'keyword', note }
  }

  let failedBatches = 0
  let totalBatches = 0
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH)
    totalBatches++
    try {
      const verdicts = await classifyBatch(batch, backend)
      // Only ids the model actually answered for are promoted. One it skipped
      // keeps its keyword topics rather than being silently emptied.
      for (const [id, t] of verdicts) {
        topics.set(id, t)
        llmVerdicts.add(id)
      }
    } catch (err) {
      failedBatches++
      console.error(`[classifier] batch ${totalBatches} failed (${backend.kind}):`, err)
    }
  }

  const mode = llmVerdicts.size === 0 ? 'keyword' : llmVerdicts.size === articles.length ? 'llm' : 'partial'
  const notes = [note]
  if (failedBatches > 0) {
    notes.push(`${failedBatches} of ${totalBatches} classification batches failed — those articles use keyword matching.`)
  }
  const combined = notes.filter(Boolean).join(' ')

  return {
    topics,
    llmVerdicts,
    backend: backend.kind,
    mode,
    ...(combined ? { note: combined } : {}),
  }
}
