export type VaultItemType = 'login' | 'note' | 'bank' | 'apikey'
export interface LoginFields { username: string; password: string; url: string }
export interface BankFields { bankName: string; accountNumber: string; ifsc: string; holder: string }
export interface ApiKeyFields { key: string; secret: string; endpoint: string }
export interface VaultItemData {
  type: VaultItemType
  title: string
  favorite: boolean
  folderId: string | null
  tags: string[]
  notes: string
  fields: LoginFields | BankFields | ApiKeyFields | Record<string, never>
}
export interface DecryptedItem { id: string; created_at: string; updated_at: string; data: VaultItemData }
export interface DecryptedFolder { id: string; parentId: string | null; name: string; sortOrder: number }

export function newId(): string { return globalThis.crypto.randomUUID() }

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  const pool =
    (/[a-z]/.test(pw) ? 26 : 0) +
    (/[A-Z]/.test(pw) ? 26 : 0) +
    (/[0-9]/.test(pw) ? 10 : 0) +
    (/[^a-zA-Z0-9]/.test(pw) ? 33 : 0)
  let bits = pw.length * Math.log2(Math.max(pool, 2))
  if (/(.)\1\1/.test(pw)) bits -= 10 // repeated-char penalty
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 90 ? 3 : 4) as 0 | 1 | 2 | 3 | 4
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]
  const color = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#16a34a'][score]
  return { score, label, color }
}

export function generatePassword(opts: { length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean }): string {
  const sets: string[] = []
  if (opts.lower) sets.push('abcdefghijkmnopqrstuvwxyz')
  if (opts.upper) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ')
  if (opts.digits) sets.push('23456789')
  if (opts.symbols) sets.push('!@#$%^&*()-_=+[]{}')
  if (sets.length === 0) sets.push('abcdefghijkmnopqrstuvwxyz')
  const all = sets.join('')
  const out: string[] = []
  const rnd = (n: number) => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n }
  // guarantee at least one from each selected set
  for (const s of sets) out.push(s[rnd(s.length)])
  while (out.length < opts.length) out.push(all[rnd(all.length)])
  // Fisher–Yates shuffle
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]] }
  return out.slice(0, opts.length).join('')
}

export function matchesQuery(item: DecryptedItem, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const d = item.data
  const hay: string[] = [d.title, ...d.tags]
  if (d.type === 'login') { const f = d.fields as LoginFields; hay.push(f.username, f.url) }
  if (d.type === 'apikey') { const f = d.fields as ApiKeyFields; hay.push(f.endpoint) }
  if (d.type === 'bank') { const f = d.fields as BankFields; hay.push(f.bankName, f.holder) }
  return hay.filter(Boolean).some(h => h.toLowerCase().includes(s))
}

export function descendantFolderIds(folders: DecryptedFolder[], rootId: string): Set<string> {
  const byParent = new Map<string | null, DecryptedFolder[]>()
  for (const f of folders) { const k = f.parentId; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k)!.push(f) }
  const out = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length) { const cur = stack.pop()!; for (const c of byParent.get(cur) ?? []) { out.add(c.id); stack.push(c.id) } }
  return out
}
