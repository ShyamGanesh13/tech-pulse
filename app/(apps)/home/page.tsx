'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Newspaper, FileText, CalendarDays, TrendingUp, Lock } from 'lucide-react'

const APPS = [
  { href: '/tech-pulse', icon: Newspaper,   label: 'Pulse',     color: '#6366f1', desc: 'Tech news feed' },
  { href: '/notes',      icon: FileText,     label: 'Notes',     color: '#06b6d4', desc: 'Rich text notes' },
  { href: '/reminders',  icon: CalendarDays, label: 'Reminders', color: '#8b5cf6', desc: 'Tasks & focus' },
  { href: '/finance',    icon: TrendingUp,   label: 'Finance',   color: '#10b981', desc: 'Coming soon' },
  { href: '/vault',      icon: Lock,         label: 'Vault',     color: '#f59e0b', desc: 'Coming soon' },
]

const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Focus is saying no to a thousand good ideas.", author: "Steve Jobs" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Perfection is achieved when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Good code is its own best documentation.", author: "Steve McConnell" },
  { text: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
  { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "Consistency is the true foundation of trust.", author: "Roy T. Bennett" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
]

const QUOTE_INTERVAL = 12000
const FADE_MS = 700

const BLOBS = [
  { color: '#6366f1', size: 560, top: '2%',   left: '4%',  anim: 'blob1 22s ease-in-out infinite', opacity: 0.20 },
  { color: '#8b5cf6', size: 500, top: '-8%',  left: '62%', anim: 'blob2 29s ease-in-out infinite', opacity: 0.16 },
  { color: '#06b6d4', size: 420, top: '58%',  left: '12%', anim: 'blob3 19s ease-in-out infinite', opacity: 0.13 },
  { color: '#4f46e5', size: 580, top: '42%',  left: '54%', anim: 'blob4 33s ease-in-out infinite', opacity: 0.15 },
  { color: '#7c3aed', size: 380, top: '72%',  left: '78%', anim: 'blob5 25s ease-in-out infinite', opacity: 0.11 },
]

export default function HomePage() {
  const [greeting, setGreeting] = useState('')
  const [date, setDate]         = useState('')
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [visible, setVisible]   = useState(false)
  const [hovered, setHovered]   = useState<string | null>(null)

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    setDate(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    setQuoteIdx(Math.floor(Math.random() * QUOTES.length))
    setVisible(true)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setQuoteIdx(i => (i + 1) % QUOTES.length)
        setVisible(true)
      }, FADE_MS)
    }, QUOTE_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const quote = QUOTES[quoteIdx]

  return (
    <>
      <style>{`
        @keyframes blob1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(70px,-55px) scale(1.10); }
          66%      { transform: translate(-35px,45px) scale(0.94); }
        }
        @keyframes blob2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%     { transform: translate(-65px,75px) scale(1.06); }
          70%     { transform: translate(55px,-30px) scale(0.91); }
        }
        @keyframes blob3 {
          0%,100% { transform: translate(0,0) scale(1); }
          25%     { transform: translate(55px,55px) scale(1.09); }
          75%     { transform: translate(-75px,-40px) scale(0.93); }
        }
        @keyframes blob4 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%     { transform: translate(-45px,-65px) scale(1.12); }
        }
        @keyframes blob5 {
          0%,100% { transform: translate(0,0) scale(1); }
          35%     { transform: translate(85px,45px) scale(0.88); }
          80%     { transform: translate(-30px,-55px) scale(1.07); }
        }
      `}</style>

      <div style={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#030712',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Animated screensaver blobs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {BLOBS.map((b, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: b.size,
              height: b.size,
              borderRadius: '50%',
              background: b.color,
              top: b.top,
              left: b.left,
              filter: 'blur(96px)',
              opacity: b.opacity,
              animation: b.anim,
            }} />
          ))}
          {/* Edge vignette to keep content readable */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 25%, rgba(3,7,18,0.65) 100%)',
          }} />
        </div>

        {/* Foreground content */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '36px',
          padding: '40px',
          width: '100%',
        }}>

          {/* Greeting */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontSize: '42px',
              fontWeight: 700,
              color: '#f9fafb',
              letterSpacing: '-0.03em',
              margin: 0,
              lineHeight: 1.1,
            }} suppressHydrationWarning>
              {greeting ? `${greeting}, Shyam.` : ' '}
            </h1>
            <p style={{
              fontSize: '13px',
              color: 'rgba(249,250,251,0.42)',
              marginTop: '10px',
              fontWeight: 400,
              letterSpacing: '0.02em',
            }} suppressHydrationWarning>
              {date}
            </p>
          </div>

          {/* Rotating quote */}
          <div style={{
            maxWidth: '500px',
            textAlign: 'center',
            opacity: visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
            minHeight: '72px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
          }}>
            <p style={{
              fontSize: '15px',
              fontStyle: 'italic',
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 400,
              color: 'rgba(249,250,251,0.68)',
              margin: 0,
              lineHeight: 1.65,
            }}>
              &ldquo;{quote.text}&rdquo;
            </p>
            {quote.author && (
              <span style={{
                fontSize: '11px',
                color: 'rgba(249,250,251,0.32)',
                fontFamily: "Georgia, 'Times New Roman', serif",
                letterSpacing: '0.05em',
              }}>
                — {quote.author}
              </span>
            )}
          </div>

          {/* App launcher */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: '560px',
          }}>
            {APPS.map(({ href, icon: Icon, label, color, desc }) => {
              const isH = hovered === href
              return (
                <Link
                  key={href}
                  href={href}
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={() => setHovered(href)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div style={{
                    background: isH ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.045)',
                    border: `1px solid ${isH ? color + '70' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '14px',
                    padding: '20px 16px',
                    width: '96px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '9px',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    transform: isH ? 'translateY(-3px)' : 'none',
                    transition: 'border-color 0.15s, transform 0.15s, background 0.15s',
                  }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: color + '28',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={19} color={color} />
                    </div>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'rgba(249,250,251,0.85)',
                      letterSpacing: '-0.01em',
                    }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      color: 'rgba(249,250,251,0.38)',
                      textAlign: 'center',
                      lineHeight: 1.3,
                    }}>
                      {desc}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
