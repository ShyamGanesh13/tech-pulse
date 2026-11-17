import { test, expect } from 'bun:test'
import { createTodo, deleteTodo } from '@/lib/data'
import { runTool } from '@/lib/urai-tools'

const A = 'test-user-urai-edit-a'
const B = 'test-user-urai-edit-b'

test('update_todo drafts only what changes, with weekday-resolved dates', async () => {
  const t = await createTodo(A, 'File taxes', null, 'medium', '2026-11-18')
  const r = await runTool(A, 'update_todo', { id: t.id, due_date: 'Fri 2026-11-20', priority: 'medium', done: true }, false)
  expect(r?.proposal).toEqual({
    kind: 'todo_update', id: t.id, title: 'File taxes',
    change: 'due Wed 2026-11-18 → Fri 2026-11-20, mark done',
    patch: { due_date: '2026-11-20', done: 1 },
  })
  const same = await runTool(A, 'update_todo', { id: t.id, priority: 'medium' }, false)
  expect(same?.proposal).toBeUndefined()
  await deleteTodo(A, t.id)
})

test("edit tools can't reach another tenant's items", async () => {
  const t = await createTodo(B, 'B private', null, 'high', '2026-11-20')
  for (const name of ['update_todo', 'delete_todo']) {
    const r = await runTool(A, name, { id: t.id, done: true }, false)
    expect(r?.proposal).toBeUndefined()
    expect(r?.context).toContain('No to-do with id')
  }
  await deleteTodo(B, t.id)
})
