import { NextRequest, NextResponse } from 'next/server'
import { getTodos, createTodo } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET() {
  const todos = getTodos()
  return NextResponse.json({ todos })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, description = null, priority = 'medium' } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  const todo = createTodo(title.trim(), description, priority)
  return NextResponse.json({ todo }, { status: 201 })
}
