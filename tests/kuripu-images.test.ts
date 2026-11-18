import { test, expect } from 'bun:test'
import { imageExtension, isImageName, noteTooLong, MAX_NOTE_CHARS } from '@/lib/kuripu-images'

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
