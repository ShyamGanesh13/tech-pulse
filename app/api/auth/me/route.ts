import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const raw = req.cookies.get('tp_user')?.value
  if (!raw) return NextResponse.json({ user: null })
  try {
    const user = JSON.parse(raw)
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ user: null })
  }
}
