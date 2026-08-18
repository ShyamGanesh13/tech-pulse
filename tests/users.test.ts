import { describe, it, expect, beforeAll } from 'bun:test'
import {
  client, createUser, findUserByEmail, findUserByFirebaseUid,
  getUserById, linkFirebaseUid, touchUserLogin,
} from '@/lib/db'

// The test DB at ./data/tech-pulse-test.db (set by lib/test-setup.ts) PERSISTS
// between runs. Without this reset the UNIQUE index on users.email makes every
// fixed-email test in this file pass once and fail on every later run.
// The getUserById call is what triggers ensureInit(), so the table exists
// before the DELETE runs.
beforeAll(async () => {
  await getUserById('trigger-schema-init')
  await client.execute(`DELETE FROM users`)
})

describe('users table', () => {
  it('creates a user and finds it by id, email and firebase uid', async () => {
    const u = await createUser({
      email: 'a@example.com', firebase_uid: 'fb-a', name: 'A Person', picture: null,
    })
    expect(u.id).toBeTruthy()
    expect(u.email).toBe('a@example.com')
    expect(u.firebase_uid).toBe('fb-a')

    expect((await getUserById(u.id))?.email).toBe('a@example.com')
    expect((await findUserByEmail('a@example.com'))?.id).toBe(u.id)
    expect((await findUserByFirebaseUid('fb-a'))?.id).toBe(u.id)
  })

  it('gives each user a distinct id', async () => {
    const a = await createUser({ email: 'd1@example.com', firebase_uid: 'fb-d1', name: null, picture: null })
    const b = await createUser({ email: 'd2@example.com', firebase_uid: 'fb-d2', name: null, picture: null })
    expect(a.id).not.toBe(b.id)
  })

  it('returns null for unknown lookups', async () => {
    expect(await getUserById('nope')).toBeNull()
    expect(await findUserByEmail('nobody@example.com')).toBeNull()
    expect(await findUserByFirebaseUid('nobody')).toBeNull()
  })

  it('allows several users with a null firebase_uid', async () => {
    const a = await createUser({ email: 'n1@example.com', firebase_uid: null, name: null, picture: null })
    const b = await createUser({ email: 'n2@example.com', firebase_uid: null, name: null, picture: null })
    expect(a.id).not.toBe(b.id)
    expect(await findUserByFirebaseUid('')).toBeNull()
  })

  it('links a firebase uid onto an existing row', async () => {
    const u = await createUser({ email: 'link@example.com', firebase_uid: null, name: null, picture: null })
    await linkFirebaseUid(u.id, 'fb-link')
    expect((await findUserByFirebaseUid('fb-link'))?.id).toBe(u.id)
  })

  it('updates profile fields and last_login_at on touch', async () => {
    const u = await createUser({ email: 't@example.com', firebase_uid: 'fb-t', name: 'Old', picture: null })
    await touchUserLogin(u.id, { name: 'New', picture: 'https://img.example/p.png' })
    const after = await getUserById(u.id)
    expect(after?.name).toBe('New')
    expect(after?.picture).toBe('https://img.example/p.png')
    expect(after!.last_login_at >= u.last_login_at).toBe(true)
  })

  it('leaves fields untouched when patch keys are absent', async () => {
    const u = await createUser({ email: 'keep@example.com', firebase_uid: 'fb-k', name: 'Keep', picture: 'pic' })
    await touchUserLogin(u.id, {})
    const after = await getUserById(u.id)
    expect(after?.name).toBe('Keep')
    expect(after?.picture).toBe('pic')
  })
})
