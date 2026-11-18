// Kuripu note images live in Catalyst Stratus, not inline in the note. A note's
// content column holds at most 10000 characters, and a pasted screenshot as a
// data: URL is 100k+ — it was silently cut on save, so the image (and any text
// after it) vanished the next time the note loaded.
//
// Keys are `kuripu/<userId>/<name>`, with the user taken from the session on
// every read and write, so one tenant can never address another's image.
import { randomUUID } from 'crypto'
import { catalystApp, safeUserId } from './catalyst'

/** Private (protected) bucket in the TechPulse project's Stratus. */
export const KURIPU_BUCKET = 'thunai-kuripu-51859'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** The note content column's size. Saves over it are refused (413), never cut:
 *  a silent cut is what lost the inline images. */
export const MAX_NOTE_CHARS = 10000

export const noteTooLong = (content: unknown) => typeof content === 'string' && content.length > MAX_NOTE_CHARS

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const CONTENT_TYPE: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([t, e]) => [e, t]))

/** "<uuid>.<ext>" — the only names the read route accepts. */
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/

export function imageExtension(contentType: string): string | null {
  return TYPES[contentType.split(';')[0].trim().toLowerCase()] ?? null
}

export function isImageName(name: string): boolean {
  return NAME.test(name)
}

const key = (userId: string, name: string) => `kuripu/${safeUserId(userId)}/${name}`

async function bucket() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await catalystApp()) as any).stratus().bucket(KURIPU_BUCKET)
}

/** Stores the image and returns its name; the note references /api/kuripu/images/<name>. */
export async function putImage(userId: string, ext: string, body: Buffer): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  await (await bucket()).putObject(key(userId, name), body, { contentType: CONTENT_TYPE[ext] })
  return name
}

/** The image bytes, or null if this user has no image by that name. */
export async function getImage(userId: string, name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isImageName(name)) return null
  try {
    const stream = await (await bucket()).getObject(key(userId, name))
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    return { body: Buffer.concat(chunks), contentType: CONTENT_TYPE[name.split('.').pop()!] }
  } catch (err) {
    const status = (err as { statusCode?: number; status?: number }).statusCode ?? (err as { status?: number }).status
    if (status === 404) return null
    throw err
  }
}
