import { test, expect } from 'bun:test'
import { parseToolCall, markdownToNoteHtml } from '@/lib/urai-tools'

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
