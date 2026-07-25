// Zero-knowledge crypto. Browser Web Crypto (also available in Bun for tests).
// NEVER import this into a server route that would receive plaintext.
const subtle = globalThis.crypto.subtle

export const DEFAULT_ITERATIONS = 600_000

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

export function toB64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function deriveKek(masterPassword: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', new TextEncoder().encode(masterPassword), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  )
}

export async function generateDek(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = randomBytes(12)
  const wrapped = await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })
  const out = new Uint8Array(iv.length + wrapped.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(wrapped), iv.length)
  return toB64(out)
}

export async function unwrapDek(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  const raw = fromB64(wrapped)
  const iv = raw.slice(0, 12)
  const body = raw.slice(12)
  // Throws OperationError if the KEK is wrong (GCM auth tag mismatch).
  return subtle.unwrapKey('raw', body, kek, { name: 'AES-GCM', iv }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function encryptJSON(data: unknown, dek: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = randomBytes(12)
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, dek, plaintext)
  return { iv: toB64(iv), ciphertext: toB64(ct) }
}

export async function decryptJSON<T>(iv: string, ciphertext: string, dek: CryptoKey): Promise<T> {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, dek, fromB64(ciphertext))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}
