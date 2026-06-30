const EMBEDDING_MODEL = 'qwen3-embedding:latest'

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const ollamaHost = process.env.OLLAMA_HOST
  if (!ollamaHost || texts.length === 0) return texts.map(() => [])

  const res = await fetch(`${ollamaHost}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(120_000),
  })

  const data = await res.json()
  // OpenAI-compatible response: { data: [{ embedding: number[] }] }
  return (data.data as { embedding: number[] }[]).map(d => d.embedding)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}
