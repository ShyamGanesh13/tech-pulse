import { describe, it, expect } from 'bun:test'
import { exportCsv, parseCsv, autoMap, exportJSON, parseJsonImport, rowsToItems } from '@/lib/vault-io'
import type { DecryptedItem, DecryptedFolder, LoginFields } from '@/lib/vault'

const folders: DecryptedFolder[] = [
  { id: 'w', parentId: null, name: 'Work', sortOrder: 0 },
  { id: 'c', parentId: 'w', name: 'Cloud', sortOrder: 0 },
]
const items: DecryptedItem[] = [{
  id: 'i1', created_at: '', updated_at: '',
  data: { type: 'login', title: 'GitHub', favorite: false, folderId: 'c', tags: ['git'], notes: 'n', fields: { username: 'u', password: 'p', url: 'https://github.com' } },
}]

describe('vault io', () => {
  it('exports and re-parses csv', () => {
    const csv = exportCsv(items, folders)
    const { headers, rows } = parseCsv(csv)
    expect(headers).toContain('title')
    const r = rows[0]
    expect(r[headers.indexOf('title')]).toBe('GitHub')
    expect(r[headers.indexOf('folder')]).toBe('Work/Cloud')
  })

  it('auto-maps common headers case-insensitively', () => {
    const m = autoMap(['Password Name', 'User Name', 'Password', 'URL', 'Notes'])
    expect(m.title).toBe(0); expect(m.username).toBe(1); expect(m.password).toBe(2); expect(m.url).toBe(3)
  })

  it('handles quoted fields containing commas, quotes, and newlines', () => {
    const csv = 'title,username,password,url,folder,tags,notes\n"Say ""Hi"", Bob",u,p,http://x,"Work/Cloud",a;b,"line1\nline2"'
    const { headers, rows } = parseCsv(csv)
    const r = rows[0]
    expect(r[headers.indexOf('title')]).toBe('Say "Hi", Bob')
    expect(r[headers.indexOf('notes')]).toBe('line1\nline2')
    expect(r[headers.indexOf('tags')]).toBe('a;b')
  })

  it('resolves a folder path through folderPathToId when building items from rows', () => {
    const { headers, rows } = parseCsv('title,username,password,url,folder,tags,notes\nGitHub,u,p,http://x,Work/Cloud,git,n')
    const map = autoMap(headers)
    const resolved = rowsToItems(rows, map, (path) => (path === 'Work/Cloud' ? 'resolved-id' : 'other'))
    expect(resolved[0].data.folderId).toBe('resolved-id')
    expect(resolved[0].data.type).toBe('login')
    expect((resolved[0].data.fields as LoginFields).username).toBe('u')
  })

  it('round-trips exportJSON -> parseJsonImport, preserving types and tags', () => {
    const json = exportJSON(items, folders)
    const { items: parsed, folders: parsedFolders } = parseJsonImport(json)
    expect(parsedFolders).toEqual([{ path: 'Work' }, { path: 'Work/Cloud' }])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('login')
    expect(parsed[0].title).toBe('GitHub')
    expect(parsed[0].tags).toEqual(['git'])
    expect(parsed[0].notes).toBe('n')
    expect((parsed[0].fields as LoginFields).password).toBe('p')
    // folderId is re-expressed as the folder's path so the importer can resolve
    // it against the *destination* vault's folders (the original id is meaningless there).
    expect(parsed[0].folderId).toBe('Work/Cloud')
  })
})
