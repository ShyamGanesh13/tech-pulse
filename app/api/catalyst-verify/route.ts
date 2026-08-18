// TEMPORARY diagnostic route for the Cloud Scale notes spike.
//
// Exists to prove, from inside AppSail, that:
//   1. the platform injects CATALYST_CONFIG / CATALYST_AUTH (so the SDK
//      self-authenticates and no OAuth client is needed), and
//   2. the ported notes functions work against the live datastore, including
//      cross-tenant isolation.
//
// Locally none of this can be verified: the CLI's credential is encrypted at a
// path the SDK does not read, and RefreshTokenCredential needs a client id and
// secret we do not have. On AppSail that problem disappears.
//
// Gated behind CRON_SECRET so it is not publicly callable. DELETE THIS ROUTE
// once the spike question is settled — it writes to the datastore.
import { NextRequest, NextResponse } from 'next/server'
import { getNotes, getNote, createNote, updateNote, deleteNote } from '@/lib/notes-catalyst'
import {
  getTodos, getTodosByDate, getAgendaTodos, getDatesWithTodos,
  createTodo, updateTodo, deleteTodo,
  getNyabagamByDate, getUpcomingNyabagam, getDatesWithNyabagam,
  createNyabagam, deleteNyabagam,
} from '@/lib/todos-catalyst'

export const dynamic = 'force-dynamic'

const A = 'verify-tenant-a'
const B = 'verify-tenant-b'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: { name: string; pass: boolean; detail?: string }[] = []
  const add = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail })

  // What the platform actually gives us — the whole reason this route exists.
  // NAMES ONLY — never values. Some of these would be credentials.
  const platform = {
    envKeys: Object.keys(process.env)
      .filter(k => /catalyst|zoho|^zc_|appsail/i.test(k)).sort(),
    headerNames: [...req.headers.keys()]
      .filter(h => /catalyst|zoho|zc-|ticket|auth/i.test(h)).sort(),
    hasConfig: !!process.env.CATALYST_CONFIG,
    hasAuth: !!process.env.CATALYST_AUTH,
    accountsUrl: process.env.X_ZOHO_CATALYST_ACCOUNTS_URL ?? '(unset until adapter runs)',
  }
  const env = platform

  try {
    // 1. create + read back
    const a1 = await createNote(A, 'A note one', '<p>A body one</p>')
    // Ids are self-generated uuids now, never ROWIDs — so they cannot be rounded
    // by JSON.parse and are byte-identical on Turso and Catalyst.
    add('createNote returns a uuid id',
        /^[0-9a-fA-F-]{36}$/.test(a1.id), `id=${a1.id}`)
    add('id is not a ROWID (immune to the rounding bug)', !/^\d+$/.test(a1.id))
    const got = await getNote(A, a1.id)
    add('getNote round-trips title', got?.title === 'A note one', got?.title)
    add('getNote round-trips content', got?.content === '<p>A body one</p>')

    // 2. the injection case: content full of quotes and SQL metacharacters.
    // ZCQL cannot bind parameters, which is why writes go through the
    // object-based row API instead of an interpolated string.
    const nasty = `<p>it's "quoted" '; DROP TABLE notes; --</p>`
    const a2 = await createNote(A, `O'Brien's note`, nasty)
    const back = await getNote(A, a2.id)
    add('quoted/SQL-ish content survives verbatim', back?.content === nasty, back?.content?.slice(0, 50))
    add('quoted title survives', back?.title === `O'Brien's note`)

    // 3. list scoped to the caller
    const b1 = await createNote(B, 'B private', '<p>B SECRET</p>')
    const aList = await getNotes(A)
    add('A list contains only A rows', aList.every(n => n.user_id === A), `${aList.length} rows`)

    // 4. cross-tenant read
    add('A cannot read B row', (await getNote(A, b1.id)) === null)

    // 5. cross-tenant write
    await updateNote(A, b1.id, { title: 'HACKED', content: 'HACKED' })
    const bAfter = await getNote(B, b1.id)
    add('B title untouched by A update', bAfter?.title === 'B private', bAfter?.title)
    add('B content untouched by A update', bAfter?.content === '<p>B SECRET</p>')

    // 6. cross-tenant delete
    await deleteNote(A, b1.id)
    add('B row survives A delete', (await getNote(B, b1.id)) !== null)

    // 7. controls — proving 4-6 are the guard working, not broken SQL
    await updateNote(A, a1.id, { title: 'A note one EDITED' })
    add('CONTROL own update applies', (await getNote(A, a1.id))?.title === 'A note one EDITED')
    await deleteNote(A, a1.id)
    add('CONTROL own delete applies', (await getNote(A, a1.id)) === null)

    // 8. fail closed
    let threw = false
    try { await getNotes('') } catch { threw = true }
    add('empty userId throws', threw)

    // ── todos + reminders ────────────────────────────────────────────────
    // The valuable checks here are the workarounds for ZCQL's missing features:
    // likePrefix (because % silently matches nothing) and substr-free date
    // handling. A regression in either returns an EMPTY LIST, not an error.
    const t1 = await createTodo(A, 'A todo', 'desc', 'high', '2026-08-18T00:00:00.000Z')
    add('createTodo returns a uuid', /^[0-9a-fA-F-]{36}$/.test(t1.id), `id=${t1.id}`)
    add('priority round-trips despite the reserved column name', t1.priority === 'high')

    const aTodos = await getTodos(A)
    add('todo list is tenant-scoped', aTodos.length === 1 && aTodos[0].user_id === A, `${aTodos.length} rows`)

    const byDate = await getTodosByDate(A, '2026-08-18')
    add('getTodosByDate finds it (proves likePrefix, not %)', byDate.length === 1, `${byDate.length} rows`)

    const dots = await getDatesWithTodos(A, 2026, 8)
    add('calendar dots extract day 18 without substr', dots.includes(18), JSON.stringify(dots))

    const agenda = await getAgendaTodos(A, '2026-08-18')
    add('agenda includes the open todo', agenda.some(t => t.id === t1.id), `${agenda.length} rows`)

    await updateTodo(A, t1.id, { done: 1, completed_at: '2026-08-18T12:00:00.000Z' })
    add('CONTROL own todo update applies', (await getTodos(A))[0].done === 1)

    const r1 = await createNyabagam(A, 'A reminder', null, '2026-08-20T09:00:00.000Z')
    const upcoming = await getUpcomingNyabagam(A, '2026-08-18', 14)
    add('getUpcomingNyabagam finds it via ISO range compare',
        upcoming.some(r => r.id === r1.id), `${upcoming.length} rows`)
    add('getNyabagamByDate finds it (likePrefix)',
        (await getNyabagamByDate(A, '2026-08-20')).length === 1)
    const rDots = await getDatesWithNyabagam(A, 2026, 8)
    add('reminder dots extract day 20', rDots.includes(20), JSON.stringify(rDots))

    const bTodo = await createTodo(B, 'B todo', null, 'low', null)
    add('B todo invisible to A', (await getTodos(A)).every(t => t.user_id === A))
    await updateTodo(A, bTodo.id, { title: 'HACKED', done: 1 })
    const bAfterTodo = (await getTodos(B)).find(t => t.id === bTodo.id)
    add('B todo untouched by A update',
        bAfterTodo?.title === 'B todo' && bAfterTodo?.done === 0, bAfterTodo?.title)
    await deleteTodo(A, bTodo.id)
    add('B todo survives A delete', (await getTodos(B)).some(t => t.id === bTodo.id))

    await deleteTodo(A, t1.id); await deleteNyabagam(A, r1.id); await deleteTodo(B, bTodo.id)
    add('todo/reminder cleanup complete',
      (await getTodos(A)).length === 0 && (await getTodos(B)).length === 0)

    // cleanup
    await deleteNote(A, a2.id)
    await deleteNote(B, b1.id)
    add('cleanup leaves no verify rows',
      (await getNotes(A)).length === 0 && (await getNotes(B)).length === 0)
  } catch (e) {
    return NextResponse.json({
      env,
      fatal: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      checksCompleted: checks,
    }, { status: 500 })
  }

  const failed = checks.filter(c => !c.pass)
  return NextResponse.json({
    env,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  }, { status: failed.length ? 500 : 200 })
}
