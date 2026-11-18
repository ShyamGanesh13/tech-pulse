import { NextResponse } from 'next/server'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { getImage } from '@/lib/kuripu-images'

export const dynamic = 'force-dynamic'

// Serves one of the caller's own note images; the session decides whose folder
// is read, so another tenant's image name simply 404s.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const { name } = await params
  const img = await getImage(userId, name)
  if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(img.body), {
    headers: {
      'Content-Type': img.contentType,
      // Names are random and never reused, so the bytes behind one never change.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
