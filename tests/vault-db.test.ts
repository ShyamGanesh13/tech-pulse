import { describe, it, expect } from 'bun:test'
import { getVaultMeta, setVaultMeta, getVaultItems, createVaultItem, updateVaultItem, softDeleteVaultItem, restoreVaultItem, hardDeleteVaultItem, getVaultFolders, createVaultFolder, updateVaultFolder, softDeleteVaultFolder } from '@/lib/db'

describe('vault db', () => {
  const iid = crypto.randomUUID()
  const fid = crypto.randomUUID()

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
    const row = await createVaultItem({ id: iid, iv: 'iv1', ciphertext: 'ct1' })
    expect(row.id).toBe(iid)
    expect((await getVaultItems()).some(r => r.id === iid)).toBe(true)
    await updateVaultItem(iid, 'iv2', 'ct2')
    expect((await getVaultItems()).find(r => r.id === iid)?.ciphertext).toBe('ct2')
    await softDeleteVaultItem(iid)
    expect((await getVaultItems()).some(r => r.id === iid)).toBe(false)
    expect((await getVaultItems(true)).some(r => r.id === iid)).toBe(true)
    await restoreVaultItem(iid)
    expect((await getVaultItems()).some(r => r.id === iid)).toBe(true)
    await hardDeleteVaultItem(iid)
    expect((await getVaultItems(true)).some(r => r.id === iid)).toBe(false)
  })

  it('creates and updates folders', async () => {
    const f = await createVaultFolder({ id: fid, parent_id: null, iv: 'fiv', name_ct: 'fn', sort_order: 0 })
    expect(f.parent_id).toBeNull()
    await updateVaultFolder(fid, { sort_order: 3 })
    expect((await getVaultFolders()).find(r => r.id === fid)?.sort_order).toBe(3)
    await softDeleteVaultFolder(fid)
    expect((await getVaultFolders()).some(r => r.id === fid)).toBe(false)
  })
})
