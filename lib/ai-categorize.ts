// Batch AI categorization for transactions that keyword-matching couldn't classify
// items: array of { id: string|number, description: string }
// Returns: Map<id, category>

import { platformAIChat, platformAIConfigured } from './platform-ai'
import { CATEGORIES } from './categories'


const BATCH = 15

// AppSail cuts a request off at ~30s. platform-ai's own timeout is 120s, which
// is useless as the only limit here: a long bank statement sent as one giant
// prompt sat waiting and the gateway returned 408 with nothing at all (that is
// what the XLS import was doing). Stay inside a budget below the gateway's so a
// slow or rate-limited backend costs accuracy, never the whole import.
// (overridable only so the deadline itself is testable without a 20s test)
const DEADLINE_MS = Number(process.env.AI_CATEGORIZE_DEADLINE_MS) || 20_000

export async function aiCategorize(
  items: { id: string | number; description: string }[]
): Promise<Map<string | number, string>> {
  const result = new Map<string | number, string>()

  // Seed all items with "Other" as the default
  for (const item of items) {
    result.set(item.id, 'Other')
  }

  if (!platformAIConfigured() || items.length === 0) {
    return result
  }

  const batches: typeof items[] = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))

  // Batches run concurrently, not sequentially — each is a network round-trip,
  // and awaiting them one at a time is what pushed a few hundred rows past the
  // request timeout. Each writes its own answers into `result` as it lands, so
  // whatever came back before the deadline is kept and the rest stay "Other".
  let timer: ReturnType<typeof setTimeout> | undefined
  const all = Promise.allSettled(batches.map(batch => categorizeBatch(batch, result)))
  await Promise.race([
    all.finally(() => clearTimeout(timer)),
    new Promise<void>(resolve => { timer = setTimeout(resolve, DEADLINE_MS) }),
  ])

  return result
}

async function categorizeBatch(
  items: { id: string | number; description: string }[],
  result: Map<string | number, string>,
): Promise<void> {
  const categoriesList = CATEGORIES.join(', ')

  const prompt = `Classify each of the following financial transactions into exactly one of these categories: ${categoriesList}.

Reply with a JSON array only — no explanation, no markdown, no extra text. Format:
[{"id":"...","category":"..."}]

Transactions:
${items.map(item => `{"id":"${item.id}","description":${JSON.stringify(item.description)}}`).join('\n')}`

  try {
    let responseText: string
    try {
      responseText = await platformAIChat({ messages: [{ role: 'user', content: prompt }] })
    } catch (err) {
      console.warn(`aiCategorize: PlatformAI request failed (${err instanceof Error ? err.message : String(err)}), keeping "Other" for this batch`)
      return
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
      return
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
    console.warn(`aiCategorize: failed (${msg}), keeping "Other" for this batch`)
  }
}
