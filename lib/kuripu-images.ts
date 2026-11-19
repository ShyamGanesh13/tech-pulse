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

/** Names of the images a note's HTML references (its own /api/kuripu/images/ links). */
export function imageNames(html: string): string[] {
  const names = new Set<string>()
  for (const m of html.matchAll(/\/api\/kuripu\/images\/([0-9a-f-]{36}\.(?:png|jpg|webp|gif))/g)) names.add(m[1])
  return [...names]
}

/** Best-effort: a failed delete only leaves an orphaned object, never fails the caller. */
export async function deleteImages(userId: string, names: string[]): Promise<void> {
  if (!names.length) return
  const b = await bucket()
  await Promise.all(names.filter(isImageName).map(n =>
    b.deleteObject(key(userId, n)).catch((err: unknown) => console.error('[kuripu] image delete failed:', n, err)),
  ))
}

/** An image younger than this is never swept: it may be uploaded but not yet in
 *  a saved note (autosave lags the paste), or just removed with undo still open. */
export const SWEEP_GRACE_MS = 60 * 60 * 1000

/** Stratus lists last_modified as IST wall-clock text ("Nov 18, 2026 03:40 PM").
 *  Unparseable means "treat as new", so a format change can only keep images. */
export function listedTime(lastModified: unknown): number {
  if (typeof lastModified === 'number') return lastModified
  // Shape-check first: Date.parse is lenient enough to read "garbled GMT+0530"
  // as a date in the year 530, which would make an unknown time look ancient —
  // the one direction that lets the sweep delete inside its grace period.
  const s = String(lastModified ?? '')
  if (!/^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M$/.test(s)) return Date.now()
  const t = Date.parse(`${s} GMT+0530`)
  return Number.isFinite(t) ? t : Date.now()
}

/** Pure: which of a user's stored images no note references and are past the grace. */
export function orphanImages(
  stored: { name: string; modified: number }[], referenced: Set<string>, now = Date.now(),
): string[] {
  return stored.filter(o => !referenced.has(o.name) && now - o.modified > SWEEP_GRACE_MS).map(o => o.name)
}

/** Deletes this user's images that none of their notes show any more — the ones
 *  removed from a note by editing, which a note delete never sees. */
export async function sweepOrphanImages(userId: string, noteContents: string[]): Promise<number> {
  const b = await bucket()
  const prefix = `kuripu/${safeUserId(userId)}/`
  const stored: { name: string; modified: number }[] = []
  let token: string | undefined
  do {
    const page = await b.listPagedObjects({ prefix, maxKeys: 1000, ...(token ? { continuationToken: token } : {}) })
    for (const o of page.contents ?? []) {
      const d = o.keyDetails ?? o
      const name = String(d.key ?? '').slice(prefix.length)
      if (isImageName(name)) stored.push({ name, modified: listedTime(d.last_modified) })
    }
    token = page.truncated ? page.next_continuation_token : undefined
  } while (token)
  const orphans = orphanImages(stored, new Set(noteContents.flatMap(imageNames)))
  await deleteImages(userId, orphans)
  return orphans.length
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
