import { NextResponse } from 'next/server'
import { runFetch } from '../../../scripts/fetch'
import { getFeedPrefs } from '@/lib/data'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// The error was previously only returned in the response body and never logged,
// so a failed refresh left nothing in the AppSail application logs to diagnose
// from. Log it with its stack; the body still carries the message for the UI.
function fail(err: unknown) {
  console.error('[refresh] FAILED:', err instanceof Error ? err.stack ?? err.message : err)
  return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
}

/**
 * In-app trigger: the signed-in tenant hitting Refresh in Thagaval.
 *
 * THE ONLY WAY A REFRESH HAPPENS. There used to be a CRON_SECRET-gated GET here
 * for a scheduled global fetch; a refresh is per-tenant now, so a request with
 * no session has no preferences to fetch against and nothing sensible to do.
 * Scheduled refresh was dropped rather than turned into a loop over every tenant
 * — see docs/cron-job.md.
 *
 * Authenticates itself rather than leaning on the proxy gate, which is also why
 * /api/refresh is no longer in proxy.ts's SELF_AUTHENTICATED list.
 */
export async function POST() {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  try {
    // FAILS CLOSED. Falling back to the full catalogue on an unreadable
    // preference row would spend the entire outbound and classifier budget and
    // rebuild the tenant's feed with sources they had switched off — worse than
    // returning an error they can retry.
    const prefs = await getFeedPrefs(userId)

    const result = await runFetch({ userId, ...prefs })
    // `classifier` is passed through so the UI can say the feed is untagged
    // rather than letting a degraded run look like a confident "nothing
    // matched". `filtered` does the same job for a narrow subscription: 9 of 142
    // kept is working as configured, not a broken fetch.
    return NextResponse.json({
      ok: true,
      total: result.total,
      filtered: result.filtered,
      failed: result.failed,
      classifier: result.classifier,
    })
  } catch (err) {
    return fail(err)
  }
}
