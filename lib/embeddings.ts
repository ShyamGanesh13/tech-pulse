const EMBEDDING_MODEL = 'qwen3-embedding:latest'

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const ollamaHost = process.env.OLLAMA_HOST
  if (!ollamaHost || texts.length === 0) return texts.map(() => [])

  // Use native Ollama /api/embed (OpenAI-compatible /v1/embeddings has compute errors with qwen3-embedding)
  const res = await fetch(`${ollamaHost}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(120_000),
  })

  const data = await res.json()
  // Native response: { embeddings: number[][] }
  return data.embeddings as number[][]
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
