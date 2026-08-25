import { describe, it, expect, beforeAll, mock } from 'bun:test'

// Vault routes now resolve the caller through lib/auth, which reads cookies() —
// unavailable when handlers are invoked directly outside a request scope. Stub
// the DAL to a fixed tenant so this stays a test of the routes' own logic.
const TEST_UID = 'test-user-vault-api'
mock.module('@/lib/auth', () => ({
  getUserIdOrNull: async () => TEST_UID,
  unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  SESSION_COOKIE: 'tp_session',
}))

const { getVaultMeta, client } = await import('@/lib/db')
import { GET as status } from '@/app/api/aran/status/route'
import { POST as setup } from '@/app/api/aran/setup/route'
import { POST as password } from '@/app/api/aran/password/route'
import { GET as listItems, POST as createItem } from '@/app/api/aran/items/route'
import { PUT as updateItem, DELETE as deleteItem } from '@/app/api/aran/items/[id]/route'
import { POST as createFolder } from '@/app/api/aran/folders/route'
import { PUT as updateFolder, DELETE as deleteFolder } from '@/app/api/aran/folders/[id]/route'

function req(url: string, init?: RequestInit) { return new Request(`http://localhost${url}`, init) }

beforeAll(async () => {
  // Trigger ensureInit() so vault tables exist, then wipe them for a
  // deterministic starting state (the test DB persists across runs/files).
  await getVaultMeta(TEST_UID)
  await client.executeMultiple('DELETE FROM vault_meta; DELETE FROM vault_items; DELETE FROM vault_folders;')
})

describe('vault api', () => {
  it('reports uninitialized, then initialized after setup', async () => {
    let res = await status()
    expect((await res.json()).initialized).toBe(false)

    res = await setup(req('/api/aran/setup', { method: 'POST', body: JSON.stringify({ kdf_salt: 's', kdf_iterations: 600000, wrapped_dek: 'w' }) }))
    expect(res.status).toBe(201)

    res = await status()
    const body = await res.json()
    expect(body.initialized).toBe(true)
    expect(body.kdf_salt).toBe('s')
    expect(body.kdf_iterations).toBe(600000)
    expect(body.wrapped_dek).toBe('w')
  })

  it('rejects setup when already initialized', async () => {
    const res = await setup(req('/api/aran/setup', { method: 'POST', body: JSON.stringify({ kdf_salt: 's2', kdf_iterations: 600000, wrapped_dek: 'w2' }) }))
    expect(res.status).toBe(409)
  })

  it('replaces vault meta via password change', async () => {
    const res = await password(req('/api/aran/password', { method: 'POST', body: JSON.stringify({ kdf_salt: 'newsalt', kdf_iterations: 700000, wrapped_dek: 'neww' }) }))
    expect(res.status).toBe(200)

    const body = await (await status()).json()
    expect(body.kdf_salt).toBe('newsalt')
    expect(body.kdf_iterations).toBe(700000)
  })

  it('stores item ciphertext verbatim (never decrypts)', async () => {
    const id = crypto.randomUUID()
    const createRes = await createItem(req('/api/aran/items', { method: 'POST', body: JSON.stringify({ id, iv: 'IV', ciphertext: 'CIPHER' }) }))
    expect(createRes.status).toBe(201)

    const res = await listItems(req('/api/aran/items'))
    const { items, folders } = await res.json()
    expect(Array.isArray(folders)).toBe(true)
    const row = items.find((i: { id: string }) => i.id === id)
    expect(row.iv).toBe('IV')
    expect(row.ciphertext).toBe('CIPHER')
  })

  it('updates, soft-deletes, and hard-deletes an item', async () => {
    const id = crypto.randomUUID()
    await createItem(req('/api/aran/items', { method: 'POST', body: JSON.stringify({ id, iv: 'iv1', ciphertext: 'ct1' }) }))

    const putRes = await updateItem(req(`/api/aran/items/${id}`, { method: 'PUT', body: JSON.stringify({ iv: 'iv2', ciphertext: 'ct2' }) }), { params: Promise.resolve({ id }) })
    expect(putRes.status).toBe(200)

    const activeAfterUpdate = await (await listItems(req('/api/aran/items'))).json()
    const updated = activeAfterUpdate.items.find((i: { id: string }) => i.id === id)
    expect(updated.iv).toBe('iv2')
    expect(updated.ciphertext).toBe('ct2')

    const softDelRes = await deleteItem(req(`/api/aran/items/${id}`), { params: Promise.resolve({ id }) })
    expect(softDelRes.status).toBe(200)

    const activeAfterSoftDelete = await (await listItems(req('/api/aran/items'))).json()
    expect(activeAfterSoftDelete.items.find((i: { id: string }) => i.id === id)).toBeUndefined()

    const trashRes = await listItems(req('/api/aran/items?trash=1'))
    const { items: trashed } = await trashRes.json()
    expect(trashed.find((i: { id: string }) => i.id === id)).toBeTruthy()

    const hardDelRes = await deleteItem(req(`/api/aran/items/${id}?hard=1`), { params: Promise.resolve({ id }) })
    expect(hardDelRes.status).toBe(200)

    const trashAfterHardDelete = await (await listItems(req('/api/aran/items?trash=1'))).json()
    expect(trashAfterHardDelete.items.find((i: { id: string }) => i.id === id)).toBeUndefined()
  })

  it('creates, updates, and soft-deletes a folder', async () => {
    const id = crypto.randomUUID()
    const createRes = await createFolder(req('/api/aran/folders', { method: 'POST', body: JSON.stringify({ id, parent_id: null, iv: 'fiv', name_ct: 'fname', sort_order: 1 }) }))
    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.name_ct).toBe('fname')

    const listed = await (await listItems(req('/api/aran/items'))).json()
    expect(listed.folders.find((f: { id: string }) => f.id === id)).toBeTruthy()

    const putRes = await updateFolder(req(`/api/aran/folders/${id}`, { method: 'PUT', body: JSON.stringify({ name_ct: 'renamed' }) }), { params: Promise.resolve({ id }) })
    expect(putRes.status).toBe(200)

    const listedAfterUpdate = await (await listItems(req('/api/aran/items'))).json()
    expect(listedAfterUpdate.folders.find((f: { id: string }) => f.id === id).name_ct).toBe('renamed')

    const delRes = await deleteFolder(req(`/api/aran/folders/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    expect(delRes.status).toBe(200)

    const listedAfterDelete = await (await listItems(req('/api/aran/items'))).json()
    expect(listedAfterDelete.folders.find((f: { id: string }) => f.id === id)).toBeUndefined()
  })
})
