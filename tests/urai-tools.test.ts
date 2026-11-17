import { test, expect } from 'bun:test'
import { parseToolCall, markdownToNoteHtml, toolInstruction, resolveDay } from '@/lib/urai-tools'

test('parses a tool line with JSON args', () => {
  expect(parseToolCall('TOOL: spending {"month":"2026-10"}')).toEqual({ name: 'spending', args: { month: '2026-10' } })
  expect(parseToolCall('  tool: due {"days": 7}\n')).toEqual({ name: 'due', args: { days: 7 } })
})

test('a tool line without args, or with broken JSON, still names the tool', () => {
  expect(parseToolCall('TOOL: due')).toEqual({ name: 'due', args: {} })
  expect(parseToolCall('TOOL: notes {query: rent}')).toEqual({ name: 'notes', args: {} })
})

test('an ordinary answer is not a tool call', () => {
  expect(parseToolCall('You spent ₹4,200 on food.')).toBeNull()
  expect(parseToolCall('Sure. TOOL: due {}')).toBeNull()
  expect(parseToolCall(null)).toBeNull()
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
