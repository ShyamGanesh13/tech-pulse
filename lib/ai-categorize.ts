// Batch AI categorization for transactions that keyword-matching couldn't classify
// items: array of { id: string|number, description: string }
// Returns: Map<id, category>

const CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Home Rent',
  'Finance',
  'Education',
  'Transfers',
  'Other',
]

export async function aiCategorize(
  items: { id: string | number; description: string }[]
): Promise<Map<string | number, string>> {
  const result = new Map<string | number, string>()

  // Seed all items with "Other" as the default
  for (const item of items) {
    result.set(item.id, 'Other')
  }

  if (!process.env.OLLAMA_HOST || items.length === 0) {
    return result
  }

  const model = process.env.OLLAMA_CLASSIFY_MODEL ?? 'qwen3:8b'
  const categoriesList = CATEGORIES.join(', ')

  const prompt = `Classify each of the following financial transactions into exactly one of these categories: ${categoriesList}.

Reply with a JSON array only — no explanation, no markdown, no extra text. Format:
[{"id":"...","category":"..."}]

Transactions:
${items.map(item => `{"id":"${item.id}","description":${JSON.stringify(item.description)}}`).join('\n')}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    let responseText: string
    try {
      const res = await fetch(`${process.env.OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        console.warn(`aiCategorize: Ollama returned ${res.status}, keeping "Other" for all items`)
        return result
      }

      const data = await res.json() as { message?: { content?: string } }
      responseText = data.message?.content ?? ''
    } finally {
      clearTimeout(timeout)
    }

    // Extract JSON from ```json ... ``` blocks if present, otherwise use raw text
    const jsonMatch =
      responseText.match(/```json\s*([\s\S]*?)```/i) ??
      responseText.match(/```\s*([\s\S]*?)```/i)
    const jsonText = jsonMatch ? jsonMatch[1].trim() : responseText.trim()

    // Find the JSON array within the extracted text
    const arrayStart = jsonText.indexOf('[')
    const arrayEnd = jsonText.lastIndexOf(']')
    if (arrayStart === -1 || arrayEnd === -1) {
      console.warn('aiCategorize: could not locate JSON array in response, keeping "Other"')
      return result
    }

    const parsed = JSON.parse(jsonText.slice(arrayStart, arrayEnd + 1)) as Array<{
      id: string | number
      category: string
    }>

    for (const entry of parsed) {
      if (entry.id == null || !entry.category) continue
      // Match by loose equality so numeric ids passed as strings still map
      const matchedItem = items.find(
        item => String(item.id) === String(entry.id)
      )
      if (!matchedItem) continue
      const cat = CATEGORIES.includes(entry.category) ? entry.category : 'Other'
      result.set(matchedItem.id, cat)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`aiCategorize: failed (${msg}), keeping "Other" for all items`)
  }

  return result
}
