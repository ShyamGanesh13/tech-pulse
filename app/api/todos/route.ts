import { NextRequest, NextResponse } from 'next/server'
import { getTodos, getTodosByDate, getAgendaTodos, createTodo } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const date = params.get('date')
  // scope=agenda → every open task plus that day's completions, not just tasks
  // whose due date is exactly `date`.
  const agenda = params.get('scope') === 'agenda'
  let todos
  if (date) {
    todos = agenda ? await getAgendaTodos(date) : await getTodosByDate(date)
  } else {
    todos = await getTodos()
  }
  return NextResponse.json({ todos })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, description = null, priority = 'medium', due_date = null } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!due_date || typeof due_date !== 'string') {
    return NextResponse.json({ error: 'due_date is required' }, { status: 400 })
  }
  const todo = await createTodo(title.trim(), description, priority, due_date)
  return NextResponse.json({ todo }, { status: 201 })
}
