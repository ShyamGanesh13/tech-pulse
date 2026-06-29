import Anthropic from '@anthropic-ai/sdk'

const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

export async function classifyArticles(
  articles: { id: string; title: string }[]
): Promise<Map<string, string[]>> {
  const result = new Map(articles.map(a => [a.id, [] as string[]]))
  if (articles.length === 0) return result

  const client = new Anthropic()
  const list = articles.map(a => `{"id":"${a.id}","title":${JSON.stringify(a.title)}}`).join('\n')

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.max(100, 100 * Math.ceil(articles.length / 5)),
      messages: [{
        role: 'user',
        content: `Classify each article title against these topics: ${TOPICS.join(', ')}.
Reply with a JSON array only, no other text. Format: [{"id":"...","topics":["Topic1","Topic2"]},...]
Only include topics that clearly match. Use exact topic strings.

Articles:
${list}`
      }]
    })

    const text = (message.content[0] as { type: string; text: string }).text.trim()
    const parsed: { id: string; topics: string[] }[] = JSON.parse(text)
    for (const item of parsed) {
      const valid = item.topics.filter(t => TOPICS.includes(t))
      result.set(item.id, valid)
    }
  } catch {
    // API failure or parse error — return empty arrays for all
  }

  return result
}
