import { test, expect } from 'bun:test'
import { parseToolCalls, markdownToNoteHtml, toolInstruction, resolveDay } from '@/lib/urai-tools'
import { packMessageMeta, unpackMessageMeta } from '@/lib/urai-meta'

test('parses one or more tool lines with JSON args', () => {
  expect(parseToolCalls('TOOL: spending {"month":"2026-10"}')).toEqual([{ name: 'spending', args: { month: '2026-10' } }])
  expect(parseToolCalls('  tool: due {"days": 7}\n\nTOOL: add_todo {"title":"Pay rent"}\n')).toEqual([
    { name: 'due', args: { days: 7 } },
    { name: 'add_todo', args: { title: 'Pay rent' } },
  ])
})

test('a tool line without args, or with broken JSON, still names the tool', () => {
  expect(parseToolCalls('TOOL: due')).toEqual([{ name: 'due', args: {} }])
  expect(parseToolCalls('TOOL: notes {query: rent}')).toEqual([{ name: 'notes', args: {} }])
})

test('caps the number of calls', () => {
  expect(parseToolCalls(Array(5).fill('TOOL: due {}').join('\n'))).toHaveLength(3)
})

test('an ordinary answer, or prose mixed with a tool line, is not a tool call', () => {
  expect(parseToolCalls('You spent ₹4,200 on food.')).toEqual([])
  expect(parseToolCalls('Sure. TOOL: due {}')).toEqual([])
  expect(parseToolCalls('TOOL: due {}\nAnd here is the rest of my answer.')).toEqual([])
  expect(parseToolCalls(null)).toEqual([])
})

test('note HTML escapes everything before adding its own tags', () => {
  const html = markdownToNoteHtml('**Rent** <img src=x onerror=alert(1)>\n- one & two\n- <script>x</script>\n\n## Next')
  expect(html).toBe(
    '<p><strong>Rent</strong> &lt;img src=x onerror=alert(1)&gt;</p>' +
    '<ul><li>one &amp; two</li><li>&lt;script&gt;x&lt;/script&gt;</li></ul>' +
    '<h3>Next</h3>',
  )
})

test('the instruction lists the coming days with correct weekdays', () => {
  const text = toolInstruction(false)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  expect(text).toContain(today)
  for (const m of text.matchAll(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{4}-\d{2}-\d{2})/g)) {
    const wd = new Date(`${m[2]}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    expect(wd).toBe(m[1])
  }
})

test('resolveDay trusts the weekday over a miscounted date', () => {
  expect(resolveDay('Fri 2026-11-21')).toBe('2026-11-20') // Saturday's date, labelled Friday
  expect(resolveDay('Friday, 2026-11-19')).toBe('2026-11-20')
  expect(resolveDay('Fri 2026-11-20 09:00')).toBe('2026-11-20')
  expect(resolveDay('2026-11-21')).toBe('2026-11-21') // no weekday: taken as given
  expect(resolveDay('tomorrow')).toBeNull()
})

test('message meta packs drafts beside sources and still reads old rows', () => {
  const src = [{ title: 'A', url: 'https://a.example' }]
  const drafts = [{ kind: 'todo' as const, title: 'Pay rent', priority: 'high' as const, due_date: '2026-11-20', saved: true }]
  expect(unpackMessageMeta(packMessageMeta(src, drafts))).toEqual({ sources: src, proposals: drafts })
  expect(unpackMessageMeta(packMessageMeta(src, null))).toEqual({ sources: src, proposals: null })
  expect(unpackMessageMeta(JSON.stringify(src))).toEqual({ sources: src, proposals: null }) // pre-draft row
  expect(packMessageMeta(null, null)).toBeNull()
  // A draft too big for the column is dropped rather than cut into broken JSON.
  const huge = [{ kind: 'note' as const, title: 'x', content: 'y'.repeat(20000) }]
  expect(unpackMessageMeta(packMessageMeta(src, huge))).toEqual({ sources: src, proposals: null })
})
