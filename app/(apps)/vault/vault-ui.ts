// Shared UI helpers for the vault: monogram avatars, deterministic colors, and
// per-type metadata (label + icon). Kept framework-free so ItemGrid/ItemDetail
// (and the Task 8 editor) can all import from one place.

import type { LucideIcon } from 'lucide-react'
import { KeyRound, StickyNote, Landmark, Code2 } from 'lucide-react'
import type { VaultItemType } from '@/lib/vault'

/** Up to two uppercase letters for a monogram avatar, derived from the title. */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Stable hsl() color derived from a string (item id) so an avatar's color never changes. */
export function colorFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 45%)`
}

export const TYPE_META: Record<VaultItemType, { label: string; icon: LucideIcon }> = {
  login: { label: 'Login', icon: KeyRound },
  note: { label: 'Secure note', icon: StickyNote },
  bank: { label: 'Bank account', icon: Landmark },
  apikey: { label: 'API key', icon: Code2 },
}
