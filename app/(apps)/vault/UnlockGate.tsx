'use client'

import { useState } from 'react'
import { Lock, ShieldAlert, Loader2 } from 'lucide-react'
import { useVault } from './VaultContext'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px', background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {children}
      </div>
    </div>
  )
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: '10px', background: 'var(--accent-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
    }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}

function SetupScreen() {
  const { setup } = useVault()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      await setup(password)
    } catch {
      setError('Could not create the vault. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Centered>
      <IconBadge><Lock size={20} color="var(--accent)" /></IconBadge>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Create your vault</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Choose a master password. It encrypts everything.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Master password"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Confirm master password"
          style={inputStyle}
        />

        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
          borderRadius: '6px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
        }}>
          <ShieldAlert size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#ef4444', fontWeight: 500 }}>
            There is no recovery. If you forget this password your vault is lost forever.
          </span>
        </div>

        {error && <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>}

        <button
          type="submit"
          disabled={submitting || !password || !confirm}
          style={{
            marginTop: '4px', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--accent)',
            background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600,
            fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting || !password || !confirm ? 0.6 : 1,
          }}
        >
          {submitting ? 'Creating…' : 'Create vault'}
        </button>
      </form>
    </Centered>
  )
}

function UnlockScreen() {
  const { unlock } = useVault()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setError(null)
    setSubmitting(true)
    try {
      await unlock(password)
    } catch (err) {
      // `unlock()` throws a distinguishable 'Wrong master password' Error for a
      // failed unwrap; any other failure (e.g. the post-unwrap loadAll/decrypt/
      // network call) throws a different message — show that instead of lying
      // about the password, and only shake for an actual wrong-password guess.
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message === 'Wrong master password') {
        setError('Wrong master password')
        setShake(true)
        setTimeout(() => setShake(false), 400)
      } else {
        setError(`Couldn't unlock — ${message}`)
      }
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Centered>
      <IconBadge><Lock size={20} color="var(--accent)" /></IconBadge>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Vault locked</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Enter your master password to unlock.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Master password"
          autoFocus
          style={{
            ...inputStyle,
            border: error ? '1px solid #ef4444' : inputStyle.border,
            animation: shake ? 'vault-shake 0.4s' : 'none',
          }}
        />

        {error && <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>}

        <button
          type="submit"
          disabled={submitting || !password}
          style={{
            marginTop: '4px', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--accent)',
            background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600,
            fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting || !password ? 0.6 : 1,
          }}
        >
          {submitting ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>

      <style>{`
        @keyframes vault-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }
      `}</style>
    </Centered>
  )
}

function LoadingScreen() {
  return (
    <Centered>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <Loader2 size={22} color="var(--text-muted)" style={{ animation: 'vault-spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</span>
      </div>
      <style>{`@keyframes vault-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Centered>
  )
}

export default function UnlockGate() {
  const { status } = useVault()
  if (status === 'setup') return <SetupScreen />
  if (status === 'locked') return <UnlockScreen />
  return <LoadingScreen />
}
