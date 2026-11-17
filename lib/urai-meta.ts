// A message's sources and drafted proposals share the one `sources` text column,
// so Urai's drafts persist without a schema change on either backend. Rows
// written before drafts existed hold a bare sources array; drafted rows hold
// { sources, proposals }. Both backends store this text opaquely.
import type { UraiSource, StoredProposal } from './types'

const MAX = 10000 // the column cap; a cut JSON string would not parse

export function packMessageMeta(sources: UraiSource[] | null, proposals: StoredProposal[] | null): string | null {
  if (proposals?.length) {
    const packed = JSON.stringify({ sources: sources ?? [], proposals })
    // Too big to store whole (a long note draft): keep the sources, lose the
    // drafts' persistence — the chip still works until a reload.
    if (packed.length <= MAX) return packed
  }
  return sources?.length ? JSON.stringify(sources).slice(0, MAX) : null
}

export function unpackMessageMeta(text: unknown): { sources: UraiSource[] | null; proposals: StoredProposal[] | null } {
  if (!text) return { sources: null, proposals: null }
  try {
    const v = JSON.parse(String(text))
    if (Array.isArray(v)) return { sources: v, proposals: null }
    return { sources: v.sources?.length ? v.sources : null, proposals: v.proposals?.length ? v.proposals : null }
  } catch {
    return { sources: null, proposals: null }
  }
}
