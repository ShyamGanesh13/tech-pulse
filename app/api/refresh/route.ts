import { NextRequest, NextResponse } from 'next/server'
import { runFetch } from '../../../scripts/fetch'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// The error was previously only returned in the response body and never logged,
// so a failed refresh left nothing in the AppSail application logs to diagnose
// from. Log it with its stack; the body still carries the message for the UI.
function fail(err: unknown) {
  console.error('[refresh] FAILED:', err instanceof Error ? err.stack ?? err.message : err)
  return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
}

// In-app trigger: the signed-in user hitting Refresh in Thagaval.
//
// Authenticates ITSELF rather than leaning on the proxy gate. This path is listed
// in proxy.ts's SELF_AUTHENTICATED so the cron's GET can get through without a
// cookie, and that exemption is per-path, not per-method — so without this check
// the exemption would have silently made POST anonymous, letting anyone trigger
// a full 8-source fetch.
export async function POST() {
  if (!(await getUserIdOrNull())) return unauthorized()
  try {
    const result = await runFetch()
    // classifier is passed through so the UI can say the feed is untagged rather
    // than letting a degraded run look like a confident "nothing matched".
    return NextResponse.json({ ok: true, total: result.total, failed: result.failed, classifier: result.classifier })
  } catch (err) {
    return fail(err)
  }
}

// Cron trigger. Articles are GLOBAL content, not per-tenant, so a refresh needs
// no user context — which is what lets a scheduled job own it instead of relying
// on somebody opening the app. Bearer-authenticated because a cron carries no
// cookie, and listed in proxy.ts's SELF_AUTHENTICATED for the same reason.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Fail closed: without a secret there is no way to distinguish the cron from
  // an anonymous request, and this endpoint does a large amount of outbound work.
  if (!secret) {
    console.error('[refresh] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runFetch()
    // classifier is passed through so the UI can say the feed is untagged rather
    // than letting a degraded run look like a confident "nothing matched".
    return NextResponse.json({ ok: true, total: result.total, failed: result.failed, classifier: result.classifier })
  } catch (err) {
    return fail(err)
  }
}
