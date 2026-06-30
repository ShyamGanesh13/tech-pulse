'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0d0f12',
    }}>
      <div style={{ width: '100%', maxWidth: '360px', padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px', background: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
            boxShadow: '0 0 0 8px rgba(99,102,241,0.12)',
          }}>
            <LayoutGrid size={24} color="white" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f9fafb', margin: 0, letterSpacing: '-0.02em' }}>Tech Pulse</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>Sign in to continue</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} style={{
          background: '#151820', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '28px',
        }}>
          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: '16px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', fontSize: '13px', color: '#f87171',
            }}>{error}</div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', background: '#0d0f12',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                color: '#f9fafb', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Passcode</label>
            <input
              type="password" value={passcode} onChange={e => setPasscode(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', background: '#0d0f12',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                color: '#f9fafb', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px',
            background: loading ? '#4f46e5' : '#6366f1',
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
