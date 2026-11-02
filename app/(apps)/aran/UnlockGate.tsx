'use client'

import { useState } from 'react'
import { Lock, ShieldAlert, Loader2 } from 'lucide-react'
import { useVault } from './VaultContext'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative', height: '100%', minHeight: '440px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px', overflow: 'hidden',
    }}>
      {/* Ambient amber glow — static depth behind the hero, no motion. */}
      <div aria-hidden style={{
        position: 'absolute', width: '520px', height: '520px', borderRadius: '50%', top: '50%', left: '50%',
        transform: 'translate(-50%, -58%)',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--app-aran) 26%, transparent), transparent 68%)',
        filter: 'blur(90px)', opacity: 0.55, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: '372px', background: 'var(--glass)',
        backdropFilter: 'blur(var(--blur))', WebkitBackdropFilter: 'blur(var(--blur))',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '36px 30px',
        display: 'flex', flexDirection: 'column', gap: '18px', boxShadow: 'var(--sh-3)',
      }}>
        {children}
      </div>
      <style>{`
        .aran-input { transition: border-color .2s, box-shadow .2s; }
        .aran-input:focus {
          border-color: var(--app-aran) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-aran) 22%, transparent);
        }
        .aran-cta { transition: transform .2s ease, box-shadow .3s ease, opacity .2s; }
        .aran-cta:not(:disabled):hover { transform: translateY(-1px); box-shadow: var(--sh-3); }
        .aran-cta:focus-visible { outline: 2px solid var(--app-aran); outline-offset: 3px; }
      `}</style>
    </div>
  )
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '54px', height: '54px', borderRadius: '16px', margin: '0 auto',
      background: 'color-mix(in srgb, var(--app-aran) 15%, transparent)',
      border: '1px solid color-mix(in srgb, var(--app-aran) 42%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: 'var(--tile-glow) var(--app-aran)',
    }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
  background: 'var(--surface-1)', color: 'var(--text-1)', fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}

const ctaStyle: React.CSSProperties = {
  marginTop: '4px', padding: '11px 14px', borderRadius: '999px', border: 'none',
  background: 'var(--app-aran)', color: '#241a08', fontSize: '13px', fontWeight: 700,
  fontFamily: 'inherit', boxShadow: 'var(--sh-2)',
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
      <IconBadge><Lock size={24} color="var(--app-aran)" /></IconBadge>
      <div style={{ textAlign: 'center' }}>
        <div className="font-display" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Create your vault</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-2)', marginTop: '6px' }}>
          Choose a master password. It encrypts everything.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          className="aran-input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Master password"
          autoFocus
          style={inputStyle}
        />
        <input
          className="aran-input"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Confirm master password"
          style={inputStyle}
        />

        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '11px 13px',
          borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
        }}>
          <ShieldAlert size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#ef4444', fontWeight: 500 }}>
            There is no recovery. If you forget this password your vault is lost forever.
          </span>
        </div>

        {error && <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>}

        <button
          type="submit"
          className="aran-cta"
          disabled={submitting || !password || !confirm}
          style={{
            ...ctaStyle,
            cursor: submitting ? 'not-allowed' : 'pointer',
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
      <IconBadge><Lock size={24} color="var(--app-aran)" /></IconBadge>
      <div style={{ textAlign: 'center' }}>
        <div className="font-display" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Aran locked</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-2)', marginTop: '6px' }}>
          Enter your master password to unlock.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          className="aran-input"
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
          className="aran-cta"
          disabled={submitting || !password}
          style={{
            ...ctaStyle,
            cursor: submitting ? 'not-allowed' : 'pointer',
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <Loader2 size={24} color="var(--app-aran)" style={{ animation: 'vault-spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>Loading…</span>
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
