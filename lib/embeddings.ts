import { platformAIEmbed, platformAIConfigured } from './platform-ai'

export async function generateEmbeddings(texts: string[], prefix: 'search_document' | 'search_query' = 'search_document'): Promise<number[][]> {
  if (!platformAIConfigured() || texts.length === 0) return texts.map(() => [])
  const taskType = prefix === 'search_query' ? 'retrivial_query' : 'retrivial_document'
  return platformAIEmbed(texts, taskType)
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
