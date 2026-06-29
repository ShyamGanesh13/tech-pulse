const TOPICS = ["AI", "Machine Learning", "Deep Learning", "LLMs", "Transformers", "Coding Agents", "Latest Models"]

export async function classifyArticles(
  articles: { id: string; title: string }[]
): Promise<Map<string, string[]>> {
  const result = new Map(articles.map(a => [a.id, [] as string[]]))
  if (articles.length === 0) return result

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return result

  const list = articles.map(a => `{"id":"${a.id}","title":${JSON.stringify(a.title)}}`).join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: Math.max(100, 100 * Math.ceil(articles.length / 5)),
        messages: [{
          role: 'user',
          content: `Classify each article title against these topics: ${TOPICS.join(', ')}.
Reply with a JSON array only, no other text. Format: [{"id":"...","topics":["Topic1","Topic2"]},...]
Only include topics that clearly match. Use exact topic strings.

Articles:
${list}`
        }]
      }),
    })

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const parsed: { id: string; topics: string[] }[] = JSON.parse(text)
    for (const item of parsed) {
      const valid = item.topics.filter((t: string) => TOPICS.includes(t))
      result.set(item.id, valid)
    }
  } catch {
    // API failure or parse error — return empty arrays for all
  }

  return result
}
