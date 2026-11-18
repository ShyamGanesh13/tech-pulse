import { NextResponse } from 'next/server'
import { getUserIdOrNull, unauthorized } from '@/lib/auth'
import { putImage, imageExtension, MAX_IMAGE_BYTES } from '@/lib/kuripu-images'

export const dynamic = 'force-dynamic'

// Upload one pasted image. The body is the raw image bytes with its own
// Content-Type (no multipart), and the reply is the URL the note stores.
export async function POST(req: Request) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  const ext = imageExtension(req.headers.get('content-type') ?? '')
  if (!ext) return NextResponse.json({ error: 'Only PNG, JPEG, WebP or GIF images' }, { status: 415 })

  const body = Buffer.from(await req.arrayBuffer())
  if (body.length === 0) return NextResponse.json({ error: 'Empty image' }, { status: 400 })
  if (body.length > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Image is over 5 MB' }, { status: 413 })

  const name = await putImage(userId, ext, body)
  return NextResponse.json({ url: `/api/kuripu/images/${name}` }, { status: 201 })
}
