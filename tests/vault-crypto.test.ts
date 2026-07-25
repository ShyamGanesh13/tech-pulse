import { describe, it, expect } from 'bun:test'
import {
  deriveKek, generateDek, wrapDek, unwrapDek, encryptJSON, decryptJSON, randomBytes, DEFAULT_ITERATIONS,
} from '@/lib/vault-crypto'

describe('vault-crypto', () => {
  it('wraps and unwraps the DEK with the right password', async () => {
    const salt = randomBytes(16)
    const kek = await deriveKek('correct horse', salt, DEFAULT_ITERATIONS)
    const dek = await generateDek()
    const wrapped = await wrapDek(dek, kek)
    const unwrapped = await unwrapDek(wrapped, kek)
    // prove the unwrapped key is functionally the same: encrypt with one, decrypt with other
    const { iv, ciphertext } = await encryptJSON({ a: 1 }, dek)
    expect(await decryptJSON<{ a: number }>(iv, ciphertext, unwrapped)).toEqual({ a: 1 })
  })

  it('fails to unwrap with the wrong password', async () => {
    const salt = randomBytes(16)
    const kek = await deriveKek('correct horse', salt, DEFAULT_ITERATIONS)
    const dek = await generateDek()
    const wrapped = await wrapDek(dek, kek)
    const wrongKek = await deriveKek('wrong', salt, DEFAULT_ITERATIONS)
    await expect(unwrapDek(wrapped, wrongKek)).rejects.toBeDefined()
  })

  it('round-trips item JSON', async () => {
    const dek = await generateDek()
    const data = { type: 'login', title: 'GitHub', fields: { username: 'u', password: 'p', url: 'x' } }
    const { iv, ciphertext } = await encryptJSON(data, dek)
    expect(await decryptJSON(iv, ciphertext, dek)).toEqual(data)
  })
})
