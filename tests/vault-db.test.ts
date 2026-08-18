import { describe, it, expect, beforeAll } from 'bun:test'
import { createUser, getVaultMeta, setVaultMeta, getVaultItems, createVaultItem, updateVaultItem, softDeleteVaultItem, restoreVaultItem, hardDeleteVaultItem, getVaultFolders, createVaultFolder, updateVaultFolder, softDeleteVaultFolder } from '@/lib/db'

// Every vault function is now scoped to a user: vault_meta went from a hard
// singleton (id = 1) to one row per user, so these need a real tenant to act as.
let U = ''

beforeAll(async () => {
  U = (await createUser({
    email: `vault-db-${crypto.randomUUID()}@test.local`,
    firebase_uid: `fb-${crypto.randomUUID()}`,
    name: 'Vault DB Test', picture: null,
  })).id
})

describe('vault db', () => {
  const iid = crypto.randomUUID()
  const fid = crypto.randomUUID()

  it('meta round-trips as one row per user', async () => {
    await setVaultMeta(U, { kdf_salt: 'salt1', kdf_iterations: 600000, wrapped_dek: 'wd1' })
    let m = await getVaultMeta(U)
    expect(m?.kdf_salt).toBe('salt1')
    await setVaultMeta(U, { kdf_salt: 'salt2', kdf_iterations: 600000, wrapped_dek: 'wd2' })
    m = await getVaultMeta(U)
    expect(m?.kdf_salt).toBe('salt2')
    expect(m?.wrapped_dek).toBe('wd2')
  })

  it('creates, updates, soft-deletes and restores items', async () => {
    const row = await createVaultItem(U, { id: iid, iv: 'iv1', ciphertext: 'ct1' })
    expect(row.id).toBe(iid)
    expect((await getVaultItems(U)).some(r => r.id === iid)).toBe(true)
    await updateVaultItem(U, iid, 'iv2', 'ct2')
    expect((await getVaultItems(U)).find(r => r.id === iid)?.ciphertext).toBe('ct2')
    await softDeleteVaultItem(U, iid)
    expect((await getVaultItems(U)).some(r => r.id === iid)).toBe(false)
    expect((await getVaultItems(U, true)).some(r => r.id === iid)).toBe(true)
    await restoreVaultItem(U, iid)
    expect((await getVaultItems(U)).some(r => r.id === iid)).toBe(true)
    await hardDeleteVaultItem(U, iid)
    expect((await getVaultItems(U, true)).some(r => r.id === iid)).toBe(false)
  })

  it('creates and updates folders', async () => {
    const f = await createVaultFolder(U, { id: fid, parent_id: null, iv: 'fiv', name_ct: 'fn', sort_order: 0 })
    expect(f.parent_id).toBeNull()
    await updateVaultFolder(U, fid, { sort_order: 3 })
    expect((await getVaultFolders(U)).find(r => r.id === fid)?.sort_order).toBe(3)
    await softDeleteVaultFolder(U, fid)
    expect((await getVaultFolders(U)).some(r => r.id === fid)).toBe(false)
  })
})
