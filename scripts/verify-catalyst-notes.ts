// Proves the Catalyst notes spike end-to-end against the live datastore.
//
// Run with:  npm run verify:catalyst
//
// Requires these in .env.local (see the console steps in the migration notes):
//   CATALYST_PROJECT_ID      51859000000044026
//   CATALYST_PROJECT_DOMAIN  https://techpulse-60083086752.development.catalystserverless.in
//   CATALYST_PROJECT_KEY     the project ZAID
//   CATALYST_CLIENT_ID       from a Self Client in api-console.zoho.in
//   CATALYST_CLIENT_SECRET   idem
//   CATALYST_REFRESH_TOKEN   generated from the self-client grant token
//   CATALYST_ENVIRONMENT     Development
import { getNotes, getNote, createNote, updateNote, deleteNote } from '../lib/notes-catalyst'

const A = 'verify-tenant-a'
const B = 'verify-tenant-b'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const missing = [
    'CATALYST_PROJECT_ID', 'CATALYST_PROJECT_DOMAIN', 'CATALYST_PROJECT_KEY',
    'CATALYST_CLIENT_ID', 'CATALYST_CLIENT_SECRET', 'CATALYST_REFRESH_TOKEN',
  ].filter(k => !process.env[k])
  if (missing.length) {
    console.error('Cannot run — missing env vars:\n  ' + missing.join('\n  '))
    process.exit(1)
  }

  console.log('\n1. create + read back (own tenant)')
  const a1 = await createNote(A, 'A note one', '<p>A body one</p>')
  check('createNote returns a numeric id', Number.isFinite(a1.id) && a1.id > 0, `id=${a1.id}`)
  const fetched = await getNote(A, a1.id)
  check('getNote returns the row', fetched?.title === 'A note one')
  check('content round-trips', fetched?.content === '<p>A body one</p>')

  console.log('\n2. content with quotes survives (the injection case)')
  const nasty = `<p>it's "quoted" -- DROP TABLE notes; '</p>`
  const a2 = await createNote(A, `O'Brien's note`, nasty)
  const back = await getNote(A, a2.id)
  check('single quotes preserved verbatim', back?.content === nasty, JSON.stringify(back?.content?.slice(0, 40)))
  check('quoted title preserved', back?.title === `O'Brien's note`)

  console.log('\n3. list is scoped and ordered')
  const b1 = await createNote(B, 'B private', '<p>B SECRET</p>')
  const aList = await getNotes(A)
  check('A does not see B rows', aList.every(n => n.user_id === A), `${aList.length} rows`)
  check('ordered by updated_at DESC', aList.length >= 2 && aList[0].updated_at >= aList[1].updated_at)

  console.log('\n4. cross-tenant READ blocked')
  check('A cannot getNote B row', (await getNote(A, b1.id)) === null)

  console.log('\n5. cross-tenant WRITE blocked')
  await updateNote(A, b1.id, { title: 'HACKED', content: 'HACKED' })
  const bAfter = await getNote(B, b1.id)
  check('B title untouched', bAfter?.title === 'B private', String(bAfter?.title))
  check('B content untouched', bAfter?.content === '<p>B SECRET</p>')

  console.log('\n6. cross-tenant DELETE blocked')
  await deleteNote(A, b1.id)
  check('B row still present', (await getNote(B, b1.id)) !== null)

  console.log('\n7. legitimate update + delete work (control for 5 and 6)')
  await updateNote(A, a1.id, { title: 'A note one EDITED' })
  check('own update applies', (await getNote(A, a1.id))?.title === 'A note one EDITED')
  await deleteNote(A, a1.id)
  check('own delete applies', (await getNote(A, a1.id)) === null)

  console.log('\n8. fail closed on empty userId')
  let threw = false
  try { await getNotes('') } catch { threw = true }
  check('getNotes("") throws', threw)

  console.log('\ncleanup')
  for (const [uid, note] of [[A, a2], [B, b1]] as const) {
    await deleteNote(uid, note.id)
  }
  check('cleanup left no rows for the verify tenants',
    (await getNotes(A)).length === 0 && (await getNotes(B)).length === 0)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error('\nverify crashed:', e); process.exit(1) })
