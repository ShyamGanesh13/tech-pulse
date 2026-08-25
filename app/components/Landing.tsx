import Link from 'next/link'

const APPS = [
  {
    name: 'Thagaval', color: '#6366f1', bg: 'rgba(99,102,241,0.15)',
    desc: 'News from 10 sources, sorted into 11 topics — bookmark what matters, skip the rest.',
    icon: <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M4 20V7 M8 8h8M8 12h8M8 16h5" />,
  },
  {
    name: 'Kuripu', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',
    desc: 'Rich text notes. No upgrade nag, no third-party sync.',
    icon: <path d="M14 3v4a1 1 0 0 0 1 1h4 M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z M9 13h6M9 17h6" />,
  },
  {
    name: 'Ninaivu', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',
    desc: 'Due dates, priority, and a push notification the second something’s due.',
    icon: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /><circle cx="8.5" cy="15" r="1.4" fill="#8b5cf6" stroke="none" /></>,
  },
  {
    name: 'Urai', color: '#ec4899', bg: 'rgba(236,72,153,0.15)',
    desc: 'An AI chat that streams its answer and can search the web mid-reply.',
    icon: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  },
  {
    name: 'Selvam', color: '#10b981', bg: 'rgba(16,185,129,0.15)',
    desc: 'Drop in a bank statement — PDF or Excel — for categorized spending and an AI summary.',
    icon: <><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" /><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2" /><circle cx="16" cy="13" r="1.4" fill="#10b981" stroke="none" /></>,
  },
  {
    name: 'Vault', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',
    desc: 'Encrypted in your browser before it ever leaves. The server only ever sees ciphertext.',
    icon: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  },
]

const PAIRS = [
  { theirs: 'A dozen open tabs, an RSS reader', ours: 'Thagaval', color: '#6366f1' },
  { theirs: 'Google Keep', ours: 'Kuripu', color: '#06b6d4' },
  { theirs: 'Todoist', ours: 'Ninaivu', color: '#8b5cf6' },
  { theirs: 'A ChatGPT tab', ours: 'Urai', color: '#ec4899' },
  { theirs: 'A budgeting spreadsheet', ours: 'Selvam', color: '#10b981' },
  { theirs: '1Password', ours: 'Vault', color: '#f59e0b' },
]

const DOT_COLORS = ['#6366f1', '#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b']

export default function Landing() {
  return (
    <>
      <style>{`
        @keyframes landingBlobA { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.08)} 66%{transform:translate(-30px,35px) scale(0.95)} }
        @keyframes landingBlobB { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-55px,60px) scale(1.05)} 70%{transform:translate(45px,-25px) scale(0.92)} }
        @keyframes landingBlobC { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(45px,45px) scale(1.07)} 75%{transform:translate(-60px,-35px) scale(0.94)} }
        .landing-card { background: rgba(255,255,255,0.72); border: 1px solid rgba(99,102,241,0.14); border-radius: 16px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .landing-grid6 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 760px) {
          .landing-h1 { font-size: 48px !important; }
          .landing-section { padding-left: 24px !important; padding-right: 24px !important; }
          .landing-grid6 { grid-template-columns: 1fr !important; }
          .landing-pain-row { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }
          .landing-arrow { display: none; }
        }
      `}</style>

      <div style={{ width: '100%', minHeight: '100vh', position: 'relative', background: 'linear-gradient(160deg, #f3f4ff 0%, #eef2ff 45%, #e8f4fd 100%)', overflow: 'hidden' }}>

        {/* ambient blobs, one per app color */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: '#6366f1', top: '-6%', left: '2%', filter: 'blur(90px)', opacity: 0.10, animation: 'landingBlobA 24s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', background: '#ec4899', top: '8%', left: '66%', filter: 'blur(90px)', opacity: 0.08, animation: 'landingBlobB 30s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 480, height: 480, borderRadius: '50%', background: '#06b6d4', top: '46%', left: '6%', filter: 'blur(90px)', opacity: 0.08, animation: 'landingBlobC 26s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 440, height: 440, borderRadius: '50%', background: '#10b981', top: '62%', left: '60%', filter: 'blur(90px)', opacity: 0.08, animation: 'landingBlobA 33s ease-in-out infinite reverse' }} />
          <div style={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%', background: '#f59e0b', top: '30%', left: '40%', filter: 'blur(90px)', opacity: 0.06, animation: 'landingBlobB 21s ease-in-out infinite reverse' }} />
          <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: '#8b5cf6', top: '82%', left: '20%', filter: 'blur(90px)', opacity: 0.07, animation: 'landingBlobC 28s ease-in-out infinite' }} />
        </div>

        {/* ── HERO ── */}
        <section className="landing-section" style={{ position: 'relative', width: '100%', padding: '88px 40px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 22 }}>
            {DOT_COLORS.map(c => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}aa` }} />
            ))}
          </div>

          <h1 className="landing-h1" style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#111827', margin: '0 0 20px' }}>
            Six apps.<br />One <span style={{ color: '#6366f1' }}>THUNAI</span>.
          </h1>

          <p style={{ maxWidth: 540, fontSize: 17, lineHeight: 1.65, color: '#4b5563', margin: 0 }}>
            Thagaval, Kuripu, Ninaivu, Urai, Selvam and Vault — six things built one at a time, now living under one roof.
          </p>
        </section>

        {/* ── ALREADY JUGGLING THIS ── */}
        <section className="landing-section" style={{ position: 'relative', width: '100%', padding: '40px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', color: '#111827', margin: '0 0 8px' }}>Six things you&rsquo;re already doing. Spread across six different apps.</h2>
              <p style={{ fontSize: 15, color: '#6b7280', margin: 0 }}>One roof instead of six tabs.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PAIRS.map(p => (
                <div key={p.ours} className="landing-card landing-pain-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
                  <span style={{ fontSize: 14.5, color: '#6b7280' }}>{p.theirs}</span>
                  <span className="landing-arrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c7cad3" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: p.color }}>{p.ours}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHAT EACH ONE ACTUALLY DOES ── */}
        <section className="landing-section" style={{ position: 'relative', width: '100%', padding: '48px 40px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', color: '#111827', margin: '0 0 8px' }}>What each one actually does.</h2>
              <p style={{ fontSize: 15, color: '#6b7280', margin: 0 }}>Same six things — just done properly, in one place.</p>
            </div>

            <div className="landing-grid6">
              {APPS.map(a => (
                <div key={a.name} className="landing-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{a.icon}</svg>
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>{a.name}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: '#6b7280' }}>{a.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="landing-section" style={{ position: 'relative', width: '100%', padding: '24px 40px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 640, background: '#6366f1', borderRadius: 20, padding: '52px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.01em', color: '#FFFFFF', margin: '0 0 14px' }}>See it live.</h2>
            <p style={{ maxWidth: 440, fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)', margin: '0 0 28px' }}>
              Not a product launch — six apps built for myself, wired together under one roof.
            </p>
            <Link href="/login" style={{ background: '#FFFFFF', color: '#6366f1', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 999, display: 'inline-block', textDecoration: 'none' }}>
              Open THUNAI &#8599;
            </Link>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', margin: '18px 0 0' }}>Sign in with a passcode or Google — no forms, no setup.</p>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="landing-section" style={{ position: 'relative', width: '100%', padding: '0 40px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {DOT_COLORS.map(c => (
              <span key={c} style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
            ))}
          </div>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>THUNAI — six apps, one login.</span>
        </footer>

      </div>
    </>
  )
}
