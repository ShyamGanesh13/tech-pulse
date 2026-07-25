process.env.TURSO_DATABASE_URL = 'file:/tmp/tech-pulse-vault-test.db'
delete process.env.TURSO_AUTH_TOKEN

import { describe, it, expect } from 'bun:test'
import { unlinkSync } from 'fs'

// Delete any leftover DB file from a prior run BEFORE loading '@/lib/db' below.
// '@/lib/db' calls createClient() at module-eval time, which eagerly opens
// (and creates) the sqlite file and keeps a handle on it. Deleting the file
// afterwards (e.g. in beforeAll) would unlink it out from under that open
// handle and every subsequent query throws SQLITE_IOERR: disk I/O error
// (SQLITE_IOERR_FSTAT). So the delete must happen first, not in beforeAll.
try { unlinkSync('/tmp/tech-pulse-vault-test.db') } catch {}

const {
  getVaultMeta, setVaultMeta,
  getVaultItems, createVaultItem, updateVaultItem, softDeleteVaultItem, restoreVaultItem, hardDeleteVaultItem,
  getVaultFolders, createVaultFolder, updateVaultFolder, softDeleteVaultFolder,
} = await import('@/lib/db')

describe('vault db', () => {
  it('meta round-trips as a single row', async () => {
    await setVaultMeta({ kdf_salt: 'salt1', kdf_iterations: 600000, wrapped_dek: 'wd1' })
    let m = await getVaultMeta()
    expect(m?.kdf_salt).toBe('salt1')
    await setVaultMeta({ kdf_salt: 'salt2', kdf_iterations: 600000, wrapped_dek: 'wd2' })
    m = await getVaultMeta()
    expect(m?.kdf_salt).toBe('salt2')
    expect(m?.wrapped_dek).toBe('wd2')
  })

  it('creates, updates, soft-deletes and restores items', async () => {
    const row = await createVaultItem({ id: 'i1', iv: 'iv1', ciphertext: 'ct1' })
    expect(row.id).toBe('i1')
    expect((await getVaultItems()).some(r => r.id === 'i1')).toBe(true)
    await updateVaultItem('i1', 'iv2', 'ct2')
    expect((await getVaultItems()).find(r => r.id === 'i1')?.ciphertext).toBe('ct2')
    await softDeleteVaultItem('i1')
    expect((await getVaultItems()).some(r => r.id === 'i1')).toBe(false)
    expect((await getVaultItems(true)).some(r => r.id === 'i1')).toBe(true)
    await restoreVaultItem('i1')
    expect((await getVaultItems()).some(r => r.id === 'i1')).toBe(true)
    await hardDeleteVaultItem('i1')
    expect((await getVaultItems(true)).some(r => r.id === 'i1')).toBe(false)
  })

  it('creates and updates folders', async () => {
    const f = await createVaultFolder({ id: 'f1', parent_id: null, iv: 'fiv', name_ct: 'fn', sort_order: 0 })
    expect(f.parent_id).toBeNull()
    await updateVaultFolder('f1', { sort_order: 3 })
    expect((await getVaultFolders()).find(r => r.id === 'f1')?.sort_order).toBe(3)
    await softDeleteVaultFolder('f1')
    expect((await getVaultFolders()).some(r => r.id === 'f1')).toBe(false)
  })
})
