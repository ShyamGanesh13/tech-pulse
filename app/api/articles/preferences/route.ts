import { NextRequest, NextResponse } from 'next/server'
import { getFeedPrefs, setFeedPrefs } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { validateFeedPrefs } from '@/lib/feed-prefs'
import { SOURCE_KEYS, SOURCES } from '@/lib/source-registry'
import { TOPICS } from '@/lib/topic-map'

export const dynamic = 'force-dynamic'

/**
 * The tenant's feed subscription: which sources and topics Thagaval pulls from.
 *
 * ON CRUD SHAPE: there are deliberately no per-item POST/DELETE endpoints. These
 * are toggle sets, so a replace-all PUT is idempotent and immune to the
 * lost-update races you get when a user toggles six checkboxes quickly — create
 * and delete reduce to "present in the array" and "absent from it". Two verbs
 * cover the whole surface.
 *
 * This is also the cheapest read-path check against the live datastore now that
 * the catalyst-verify diagnostic route is gone.
 */

/** Catalog and selection in one response, so the settings panel needs one call. */
export async function GET() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const prefs = await getFeedPrefs(userId)
  return NextResponse.json({
    catalog: {
      sources: SOURCE_KEYS.map(key => ({ key, label: SOURCES[key].label })),
      topics: TOPICS,
    },
    ...prefs,
  })
}

export async function PUT(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Rejects rather than repairs: someone actively saving a selection should be
  // told what was wrong with it. (A stale STORED row degrades quietly instead —
  // see sanitizeFeedPrefs.) The allowlist is also what makes these values safe to
  // inline into ZCQL, which cannot bind parameters.
  const result = validateFeedPrefs(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  await setFeedPrefs(userId, result.prefs)
  return NextResponse.json({ ok: true, ...result.prefs })
}
