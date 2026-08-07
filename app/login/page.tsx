'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { useTheme } from '@/app/components/ThemeProvider'
import { auth, googleProvider } from '@/lib/firebase'
import { signInWithPopup } from 'firebase/auth'

export default function LoginPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [email, setEmail] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const e = params.get('error')
    if (e) setError('Sign-in failed. Please try again.')
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, passcode }),
    })
    setLoading(false)
    if (res.ok) {
      router.replace('/home')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Login failed')
    }
  }

  const signInWithGoogle = async () => {
    setGoogleLoading(true); setError('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const idToken = await result.user.getIdToken()
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      if (res.ok) {
        router.replace('/home')
      } else {
        const d = await res.json()
        setError(d.error ?? 'Google sign-in failed')
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Google sign-in failed. Please try again.')
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '360px', padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
            boxShadow: '0 0 0 8px var(--accent-bg)',
          }}>
            <LayoutGrid size={24} color="white" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>Tech Pulse</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '6px 0 0' }}>Sign in to continue</p>
        </div>

        {/* Google button */}
        <button onClick={signInWithGoogle} disabled={googleLoading} style={{
          width: '100%', padding: '11px 16px', marginBottom: '16px',
          background: isDark ? '#1e2330' : '#ffffff',
          color: isDark ? '#e5e7eb' : '#111827',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #dde3eb',
          borderRadius: '8px',
          fontSize: '14px', fontWeight: 600, cursor: googleLoading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          opacity: googleLoading ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}>
          {googleLoading
            ? <span style={{ fontSize: '13px' }}>Opening Google…</span>
            : <>
                <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.34-8.16 2.34-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                Sign in with Google
              </>
          }
        </button>

        {/* Card */}
        <form onSubmit={submit} style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-s)',
          borderRadius: '14px', padding: '28px',
        }}>
          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: '16px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', fontSize: '13px', color: '#f87171',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-s)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-3)', letterSpacing: '0.06em' }}>OR SIGN IN WITH PASSCODE</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-s)' }} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-1)', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Passcode</label>
            <input
              type="password" value={passcode} onChange={e => setPasscode(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-1)', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px',
            background: loading ? 'var(--accent-h)' : 'var(--accent)',
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '14px', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
