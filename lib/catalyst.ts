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

let _app: CatalystApp | null = null

// Lazily initialised so importing this module never throws at build time, only
// when a Catalyst-backed call is actually made.
export function catalystApp(): CatalystApp {
  if (_app) return _app
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const catalyst = require('zcatalyst-sdk-node')
  const credential = catalyst.credential.refreshToken({
    refresh_token: required('CATALYST_REFRESH_TOKEN'),
    client_id: required('CATALYST_CLIENT_ID'),
    client_secret: required('CATALYST_CLIENT_SECRET'),
  })
  _app = catalyst.initializeApp({
    project_id: required('CATALYST_PROJECT_ID'),
    project_key: required('CATALYST_PROJECT_KEY'),
    project_domain: required('CATALYST_PROJECT_DOMAIN'),
    environment: process.env.CATALYST_ENVIRONMENT ?? 'Development',
    credential,
  }) as CatalystApp
  return _app!
}

/** Runs a ZCQL query and flattens the table-nested rows Catalyst returns. */
export async function zcql<T = Record<string, unknown>>(sql: string, table = CATALYST_NOTES_TABLE): Promise<T[]> {
  const rows = await catalystApp().zcql().executeZCQLQuery(sql)
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
