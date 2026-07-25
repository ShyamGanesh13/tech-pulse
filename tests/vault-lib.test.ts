import { describe, it, expect } from 'bun:test'
import { passwordStrength, generatePassword, matchesQuery, descendantFolderIds, flattenFolders, buildItemData } from '@/lib/vault'
import type { DecryptedItem, DecryptedFolder, EditorFormState } from '@/lib/vault'

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
  it('terminates on a folder cycle', () => {
    const folders: DecryptedFolder[] = [
      { id: 'a', parentId: 'b', name: 'A', sortOrder: 0 },
      { id: 'b', parentId: 'a', name: 'B', sortOrder: 0 },
    ]
    const ids = descendantFolderIds(folders, 'a')
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
    expect(ids.size).toBe(2)
  })
  it('flattens the folder tree into ancestor-path labels, depth-first', () => {
    const folders: DecryptedFolder[] = [
      { id: 'root', parentId: null, name: 'Work', sortOrder: 0 },
      { id: 'f2', parentId: 'root', name: 'Cloud', sortOrder: 0 },
      { id: 'f3', parentId: 'f2', name: 'AWS', sortOrder: 0 },
      { id: 'other', parentId: null, name: 'Personal', sortOrder: 1 },
    ]
    const flat = flattenFolders(folders)
    expect(flat.map(f => f.label)).toEqual(['Work', 'Work / Cloud', 'Work / Cloud / AWS', 'Personal'])
    expect(flat.find(f => f.id === 'f3')?.depth).toBe(2)
  })
  it('builds VaultItemData from editor form state, selecting fields by type', () => {
    const base: EditorFormState = {
      type: 'login', title: '  GitHub  ', folderId: 'f1', tags: ['work'], notes: 'n',
      login: { username: 'u', password: 'p', url: 'https://github.com' },
      bank: { bankName: '', accountNumber: '', ifsc: '', holder: '' },
      apikey: { key: '', secret: '', endpoint: '' },
    }
    const login = buildItemData(base, true)
    expect(login).toEqual({
      type: 'login', title: 'GitHub', favorite: true, folderId: 'f1', tags: ['work'], notes: 'n',
      fields: { username: 'u', password: 'p', url: 'https://github.com' },
    })
    const bank = buildItemData({ ...base, type: 'bank' }, false)
    expect(bank.fields).toEqual(base.bank)
    const note = buildItemData({ ...base, type: 'note' }, false)
    expect(note.fields).toEqual({})
  })
})
