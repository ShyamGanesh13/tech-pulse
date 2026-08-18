// Catalyst Cloud Scale adapter.
//
// This is a spike: only the notes table is ported. It exists to prove the data
// layer works on Catalyst before committing to rewriting all 62 db functions.
//
// TWO HARD CONSTRAINTS discovered by probing the live datastore, both of which
// dictate the shape of everything below:
//
// 1. ZCQL has NO parameter binding. `executeZCQLQuery(sql)` takes a raw string,
//    so every value is inlined. Note content is user-authored HTML full of
//    quotes, so inlining it is a SQL-injection surface. Therefore CONTENT NEVER
//    GOES THROUGH ZCQL — inserts and updates use the object-based Datastore row
//    API, which needs no escaping.
//
// 2. The Datastore row API (updateRow / deleteRow / getRow) addresses rows by
//    ROWID ONLY, with no tenant filter. Used alone it would let one user modify
//    another's row. Therefore every row-API write is preceded by a tenant-scoped
//    ZCQL ownership check.
//
// Neither API is safe by itself. The combination is.
//
// Other verified differences from libSQL/SQLite:
//   - LIKE uses `*` as the wildcard, NOT `%`. `%` matches nothing and raises NO
//     error — a silent zero-rows failure. Use likePrefix() below, never a raw %.
//   - Results are nested under the table name: [{ notes: {...} }]. See unwrap().
//   - Column aliases (`AS x`) are ignored; keys come back as e.g. `SUM(amount)`.
//   - `LIMIT start,count` is 1-INDEXED, not SQL offset semantics.
//   - No ON CONFLICT, no RETURNING, no JOIN without a declared FK relationship.
//   - text columns cap at 10000 chars; varchar caps at 255.
//   - The integer primary key is the system column ROWID (bigint).

import type { CatalystApp } from 'zcatalyst-sdk-node/lib/catalyst-app'

export const CATALYST_NOTES_TABLE = 'notes'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set — Catalyst adapter cannot initialise`)
  return v
}

// Catalyst supplies project config AND credentials as per-request `x-zc-*`
// headers, NOT as environment variables. Measured on a live AppSail deployment:
//   CATALYST_CONFIG / CATALYST_AUTH  -> absent
//   x-zc-project-key                 -> the ZAID
//   x-zc-admin-cred-token            -> the credential
//   x-zc-projectid / -environment / -project-domain
// This is why the SDK docs use `catalyst.initialize(req)`. Because the
// credential arrives per request, the app object CANNOT be a module singleton —
// it is built per call from the incoming request headers.
//
// Off-platform (local dev) those headers do not exist, so we fall back to
// explicit options plus a credential. See the notes at the bottom for why the
// Catalyst CLI login cannot be used there.
const HEADER_KEYS = [
  'x-zc-projectid', 'x-zc-project-key', 'x-zc-environment',
  'x-zc-project-domain', 'x-zc-project-secret-key',
  'x-zc-admin-cred-token', 'x-zc-admin-cred-type',
  'x-zc-user-cred-token', 'x-zc-user-cred-type',
  'x-zc-user-id', 'x-zc-user-type',
]

function setAccountsUrl(): void {
  // Must happen BEFORE the SDK is required: its constants module resolves
  // ACCOUNTS_ORIGIN once at import time, defaulting to the US endpoint.
  const dc = (process.env.CATALYST_DC ?? 'in').toLowerCase()
  if (!process.env.X_ZOHO_CATALYST_ACCOUNTS_URL) {
    const host = dc === 'us' ? 'com' : dc === 'eu' ? 'eu' : dc === 'au' ? 'com.au' : 'in'
    process.env.X_ZOHO_CATALYST_ACCOUNTS_URL = `https://accounts.zoho.${host}`
  }
}

/**
 * Builds a Catalyst app for the CURRENT request.
 *
 * On Catalyst it reads the `x-zc-*` headers via next/headers, so no ZAID,
 * OAuth client, or refresh token is needed anywhere. Off Catalyst it falls back
 * to explicit env options.
 */
export async function catalystApp(): Promise<CatalystApp> {
  setAccountsUrl()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const catalyst = require('zcatalyst-sdk-node')

  // next/headers works in route handlers and server components. Absent outside
  // a request scope (e.g. a plain script), which the catch below handles.
  let zc: Record<string, string> | null = null
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const collected: Record<string, string> = {}
    for (const k of HEADER_KEYS) {
      const v = h.get(k)
      if (v) collected[k] = v
    }
    // project id + key are the two the SDK hard-requires.
    if (collected['x-zc-projectid'] && collected['x-zc-project-key']) zc = collected
  } catch {
    zc = null
  }

  if (zc) {
    // scope 'admin' uses x-zc-admin-cred-token — full datastore access, which is
    // what a server-side data layer needs. 'user' would scope to the Catalyst
    // end user, which this app does not use (it has its own auth).
    return catalyst.initialize({ headers: zc }, { scope: 'admin' }) as CatalystApp
  }

  // ── Off Catalyst ─────────────────────────────────────────────────────────
  // The CLI login is NOT usable here: `catalyst login` stores its credential
  // encrypted under ~/Library/Preferences/zcatalyst-cli-nodejs/ (macOS), not the
  // ~/.config/catalyst/application_auth.json path the SDK reads, and the token
  // from `catalyst token:generate` cannot be used either because
  // RefreshTokenCredential requires client_id and client_secret as well.
  const options: Record<string, unknown> = {
    project_id: required('CATALYST_PROJECT_ID'),
    project_key: required('CATALYST_PROJECT_KEY'),
    environment: process.env.CATALYST_ENVIRONMENT ?? 'Development',
  }
  if (process.env.CATALYST_PROJECT_DOMAIN) options.project_domain = process.env.CATALYST_PROJECT_DOMAIN

  const { CATALYST_REFRESH_TOKEN, CATALYST_CLIENT_ID, CATALYST_CLIENT_SECRET, CATALYST_ACCESS_TOKEN } = process.env
  if (CATALYST_REFRESH_TOKEN && CATALYST_CLIENT_ID && CATALYST_CLIENT_SECRET) {
    options.credential = catalyst.credential.refreshToken({
      refresh_token: CATALYST_REFRESH_TOKEN,
      client_id: CATALYST_CLIENT_ID,
      client_secret: CATALYST_CLIENT_SECRET,
    })
  } else if (CATALYST_ACCESS_TOKEN) {
    options.credential = catalyst.credential.accessToken(CATALYST_ACCESS_TOKEN)
  }

  return catalyst.initializeApp(options) as CatalystApp
}

/** Runs a ZCQL query and flattens the table-nested rows Catalyst returns. */
export async function zcql<T = Record<string, unknown>>(sql: string, table = CATALYST_NOTES_TABLE): Promise<T[]> {
  const app = await catalystApp()
  const rows = await app.zcql().executeZCQLQuery(sql)
  return rows.map(r => (r[table] ?? r[Object.keys(r)[0]]) as T)
}

// ── Value safety ───────────────────────────────────────────────────────────
// Because ZCQL cannot bind parameters, anything inlined must be proven safe
// rather than merely escaped. These helpers fail closed on anything unexpected.

/** A Catalyst ROWID / our integer note id. Rejects anything non-numeric. */
export function safeId(id: number | string, what = 'id'): string {
  const s = String(id)
  if (!/^\d{1,20}$/.test(s)) throw new Error(`${what} is not a valid row id: ${s}`)
  return s
}

/**
 * A tenant id. Ours are crypto.randomUUID() values, so a strict character class
 * is safe and removes any need to trust escaping on the security-critical
 * predicate. Also accepts the test tenants used by the verify script.
 */
export function safeUserId(userId: string): string {
  if (!userId) throw new Error('userId is required')
  if (!/^[A-Za-z0-9_:-]{1,64}$/.test(userId)) {
    throw new Error(`userId contains characters that cannot be safely inlined into ZCQL: ${userId}`)
  }
  return userId
}

/**
 * Escapes a string literal for ZCQL. Use ONLY for values that are not
 * user-authored free text — prefer the object-based row API for those.
 */
export function quote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/**
 * Builds a LIKE prefix pattern using Catalyst's `*` wildcard.
 * Never write `LIKE 'x%'` — % matches nothing and reports no error.
 */
export function likePrefix(prefix: string): string {
  return quote(`${prefix.replace(/[*]/g, '')}*`)
}
