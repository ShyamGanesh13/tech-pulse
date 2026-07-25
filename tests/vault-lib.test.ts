import { describe, it, expect } from 'bun:test'
import { passwordStrength, generatePassword, matchesQuery, descendantFolderIds } from '@/lib/vault'
import type { DecryptedItem, DecryptedFolder } from '@/lib/vault'

const item: DecryptedItem = {
  id: 'i1', created_at: '', updated_at: '',
  data: { type: 'login', title: 'GitHub', favorite: false, folderId: 'f2', tags: ['git', 'work'], notes: '', fields: { username: 'shyam-18219', password: 'x', url: 'https://github.com' } },
}

describe('vault lib', () => {
  it('scores weak vs strong passwords', () => {
    expect(passwordStrength('a').score).toBeLessThan(passwordStrength('Tr0ub4dour&3xtra!Long').score)
  })
  it('generates a password meeting the requested classes', () => {
    const pw = generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true })
    expect(pw.length).toBe(20)
    expect(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw)).toBe(true)
  })
  it('matches by title, username, url and tag', () => {
    expect(matchesQuery(item, 'github')).toBe(true)
    expect(matchesQuery(item, 'shyam')).toBe(true)
    expect(matchesQuery(item, 'work')).toBe(true)
    expect(matchesQuery(item, 'zzz')).toBe(false)
  })
  it('computes descendant folder ids for rollup', () => {
    const folders: DecryptedFolder[] = [
      { id: 'root', parentId: null, name: 'Work', sortOrder: 0 },
      { id: 'f2', parentId: 'root', name: 'Cloud', sortOrder: 0 },
      { id: 'f3', parentId: 'f2', name: 'AWS', sortOrder: 0 },
      { id: 'other', parentId: null, name: 'Personal', sortOrder: 1 },
    ]
    const ids = descendantFolderIds(folders, 'root')
    expect(ids.has('root') && ids.has('f2') && ids.has('f3')).toBe(true)
    expect(ids.has('other')).toBe(false)
  })
})
