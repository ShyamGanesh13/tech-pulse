'use client'

// Copy-to-clipboard with an auto-clear countdown. Vault field values (passwords,
// API secrets, account numbers) shouldn't sit on the clipboard indefinitely —
// this hook writes the value, tracks which field was copied for UI feedback,
// and overwrites the clipboard with an empty string once the countdown ends.
//
// IMPORTANT — the clear is best-effort only. The web Clipboard API has no way
// to (a) read back "is this still what I copied" before clearing, or (b)
// conditionally clear. If the user copies something else — in this app or any
// other — before the countdown ends, our clear will stomp *that* new value
// instead of "restoring" anything. There's also no guarantee the browser still
// grants clipboard-write permission by the time the timer fires (e.g. tab lost
// focus). This is the same tradeoff every browser-based password manager makes;
// it's better than never clearing, not a guarantee.

import { useCallback, useEffect, useRef, useState } from 'react'

const CLEAR_SECONDS = 20

export interface UseCopyResult {
  copy: (text: string, fieldKey: string) => void
  copiedField: string | null
  secondsLeft: number
}

export function useCopy(): UseCopyResult {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cancelTimers = useCallback(() => {
    if (clearTimer.current !== null) clearTimeout(clearTimer.current)
    if (tickTimer.current !== null) clearInterval(tickTimer.current)
    clearTimer.current = null
    tickTimer.current = null
  }, [])

  const copy = useCallback((text: string, fieldKey: string) => {
    // A new copy always wins over any pending clear/countdown from the last one.
    cancelTimers()
    navigator.clipboard.writeText(text).catch(() => {
      // clipboard access denied — nothing more we can do here
    })
    setCopiedField(fieldKey)
    setSecondsLeft(CLEAR_SECONDS)
    tickTimer.current = setInterval(() => {
      setSecondsLeft(s => (s <= 1 ? 0 : s - 1))
    }, 1000)
    clearTimer.current = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {
        // best-effort — see module note above
      })
      setCopiedField(null)
      setSecondsLeft(0)
      cancelTimers()
    }, CLEAR_SECONDS * 1000)
  }, [cancelTimers])

  // Cancel any in-flight timers if the component using this hook unmounts
  // (e.g. the detail panel closes) before the countdown finishes.
  useEffect(() => cancelTimers, [cancelTimers])

  return { copy, copiedField, secondsLeft }
}
