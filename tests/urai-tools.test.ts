import { test, expect } from 'bun:test'
import { parseToolCall } from '@/lib/urai-tools'

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
