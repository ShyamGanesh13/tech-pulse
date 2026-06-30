export const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

const BATCH = 15

function extractJSON(text: string): string {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (block) return block[1]
  const start = Math.min(
    text.includes('[') ? text.indexOf('[') : Infinity,
    text.includes('{') ? text.indexOf('{') : Infinity,
  )
  return start === Infinity ? text : text.slice(start)
}

async function classifyBatch(
  articles: { id: string; title: string }[],
  chatUrl: string,
  headers: Record<string, string>,
  model: string,
): Promise<Map<string, string[]>> {
  const result = new Map(articles.map(a => [a.id, [] as string[]]))
  const list = articles.map(a => `{"id":${JSON.stringify(a.id)},"title":${JSON.stringify(a.title)}}`).join('\n')

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are a JSON classifier. Output only valid JSON — no explanation, no reasoning, no markdown.',
        },
        {
          role: 'user',
          // /no_think disables chain-of-thought on Qwen3 thinking models
          content: `Classify each article against these topics: ${TOPICS.join(', ')}.
Reply with a JSON array only. Format: [{"id":"...","topics":["Topic1"]}]
Only include topics that clearly match. Use exact topic strings. Empty array if none match.

Articles:
${list}
/no_think`,
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  const parsed: { id: string; topics: string[] }[] = JSON.parse(extractJSON(raw))
  for (const item of parsed) {
    if (!result.has(item.id)) continue
    result.set(item.id, item.topics.filter((t: string) => TOPICS.includes(t)))
  }
  return result
}

export async function classifyArticles(
  articles: { id: string; title: string }[]
): Promise<Map<string, string[]>> {
  const result = new Map(articles.map(a => [a.id, [] as string[]]))
  if (articles.length === 0) return result

  const ollamaHost = process.env.OLLAMA_HOST
  const openaiKey = process.env.OPENAI_API_KEY
  if (!ollamaHost && !openaiKey) return result

  const chatUrl = ollamaHost
    ? `${ollamaHost}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions'
  const model = ollamaHost ? (process.env.OLLAMA_CLASSIFY_MODEL ?? process.env.OLLAMA_MODEL ?? 'llama3') : 'gpt-4o-mini'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!ollamaHost && openaiKey) headers['Authorization'] = `Bearer ${openaiKey}`

  // Process in batches to keep responses predictable
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH)
    try {
      const batchResult = await classifyBatch(batch, chatUrl, headers, model)
      for (const [id, topics] of batchResult) result.set(id, topics)
    } catch (err) {
      console.error(`[classifier] batch ${i / BATCH + 1} failed:`, err)
    }
  }

  return result
}
