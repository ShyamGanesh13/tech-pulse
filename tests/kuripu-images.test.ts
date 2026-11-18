import { test, expect } from 'bun:test'
import { imageExtension, isImageName, noteTooLong, MAX_NOTE_CHARS, imageNames, orphanImages, listedTime, SWEEP_GRACE_MS } from '@/lib/kuripu-images'

test('only the four image types are accepted for upload', () => {
  expect(imageExtension('image/png')).toBe('png')
  expect(imageExtension('image/jpeg; charset=binary')).toBe('jpg')
  expect(imageExtension('image/svg+xml')).toBeNull() // SVG can carry script
  expect(imageExtension('text/html')).toBeNull()
})

test('image names are uuid.ext only, so a read can never climb out of the user folder', () => {
  expect(isImageName('3f2b9c1e-8a4d-4c2e-9b7a-1d2e3f4a5b6c.webp')).toBe(true)
  for (const bad of ['../other-user/x.png', 'a.png', '3f2b9c1e-8a4d-4c2e-9b7a-1d2e3f4a5b6c.svg', '3f2b9c1e-8a4d-4c2e-9b7a-1d2e3f4a5b6c.png/..']) {
    expect(isImageName(bad)).toBe(false)
  }
})

test('an over-long note is refused, not cut', () => {
  expect(noteTooLong('x'.repeat(MAX_NOTE_CHARS))).toBe(false)
  expect(noteTooLong('x'.repeat(MAX_NOTE_CHARS + 1))).toBe(true)
  expect(noteTooLong(undefined)).toBe(false)
})

test('imageNames finds a note’s own image links once each, and nothing else', () => {
  const a = '3f2b9c1e-8a4d-4c2e-9b7a-1d2e3f4a5b6c.webp', b = '0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b.png'
  const html = `<p>x</p><img src="/api/kuripu/images/${a}"><img src="/api/kuripu/images/${b}">` +
    `<img src="/api/kuripu/images/${a}"><img src="https://elsewhere.example/api/kuripu/images/nope.png"><img src="data:image/png;base64,AAA">`
  expect(imageNames(html).sort()).toEqual([a, b].sort())
  expect(imageNames('<p>no images</p>')).toEqual([])
})

test('the sweep only takes unreferenced images past the grace period', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  const old = now - 2 * SWEEP_GRACE_MS, fresh = now - 60_000
  expect(orphanImages([
    { name: 'kept.png', modified: old },      // still in a note
    { name: 'gone.png', modified: old },      // removed by editing, long ago
    { name: 'pasting.png', modified: fresh }, // uploaded, note not saved yet
  ], new Set(['kept.png']), now)).toEqual(['gone.png'])
})

test('Stratus list times read as IST, and unreadable ones count as new', () => {
  expect(listedTime('Nov 18, 2026 03:40 PM')).toBe(Date.parse('2026-11-18T10:10:00Z'))
  const t = listedTime('garbled'); expect(Math.abs(t - Date.now())).toBeLessThan(1000)
})
