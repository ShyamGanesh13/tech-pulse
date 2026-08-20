import { TOPICS, keywordTopics } from './topic-map'
import { platformAIChat, platformAIConfigured } from './platform-ai'

// Re-exported so `import { TOPICS } from '@/lib/classifier'` keeps working for
// the Thagaval UI. The owning definition lives in lib/topic-map.ts alongside the
// keyword tables that key off it.
export { TOPICS }

const BATCH = 15
const OPENAI_MODEL = 'gpt-4o-mini'
const CALL_TIMEOUT_MS = 120_000

type Backend =
  | { kind: 'platformai' }
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
  backend: 'platformai' | 'openai' | 'none'
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
 * Picks a backend by configuration alone — unlike the old Ollama host (typically
 * a LAN box, unroutable from a cloud runtime and worth a liveness probe before
 * committing 120s to a dead call), PlatformAI is a public HTTPS endpoint that
 * fails fast on its own. A genuine outage is caught per-batch below instead.
 */
function pickBackend(): { backend: Backend | null; note?: string } {
  const key = process.env.OPENAI_API_KEY
  const openai: Backend | null = key ? { kind: 'openai', key, model: OPENAI_MODEL } : null

  if (platformAIConfigured()) return { backend: { kind: 'platformai' } }
  if (openai) return { backend: openai, note: 'PlatformAI is not configured — classified with OpenAI instead.' }
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

  if (backend.kind === 'platformai') {
    raw = (await platformAIChat({ messages })).trim()
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

  const { backend, note } = pickBackend()
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
