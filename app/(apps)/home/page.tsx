'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Newspaper, FileText, CalendarDays, Wallet, Lock, MessageSquare, ArrowRight } from 'lucide-react'
import { useTheme } from '@/app/components/ThemeProvider'

const APPS = [
  { href: '/thagaval', icon: Newspaper,     label: 'Thagaval', hue: 'var(--app-thagaval)', desc: 'Tech news, classified to your topics' },
  { href: '/kuripu',   icon: FileText,       label: 'Kuripu',   hue: 'var(--app-kuripu)',   desc: 'Rich-text notes' },
  { href: '/ninaivu',  icon: CalendarDays,   label: 'Ninaivu',  hue: 'var(--app-ninaivu)',  desc: 'Tasks and focus sessions' },
  { href: '/urai',     icon: MessageSquare,  label: 'Urai',     hue: 'var(--app-urai)',     desc: 'AI chat assistant' },
  { href: '/selvam',   icon: Wallet,         label: 'Selvam',   hue: 'var(--app-selvam)',   desc: 'Budget and spending insights' },
  { href: '/aran',     icon: Lock,           label: 'Aran',     hue: 'var(--app-aran)',     desc: 'Passwords, zero-knowledge' },
]

const STATIC_QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Focus is saying no to a thousand good ideas.", author: "Steve Jobs" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Good code is its own best documentation.", author: "Steve McConnell" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
]

const QUOTE_INTERVAL = 12000
const FADE_MS = 600

// Blob geometry stays fixed; colors are swapped by time of day (see PALETTES).
const BLOBS = [
  { size: 560, top: '2%',  left: '4%',  anim: 'tp-blob1 22s ease-in-out infinite', opacity: 0.20 },
  { size: 500, top: '-8%', left: '62%', anim: 'tp-blob2 29s ease-in-out infinite', opacity: 0.16 },
  { size: 420, top: '58%', left: '12%', anim: 'tp-blob3 19s ease-in-out infinite', opacity: 0.13 },
  { size: 580, top: '42%', left: '54%', anim: 'tp-blob4 33s ease-in-out infinite', opacity: 0.15 },
  { size: 380, top: '72%', left: '78%', anim: 'tp-blob5 25s ease-in-out infinite', opacity: 0.11 },
]

type Daypart = 'morning' | 'afternoon' | 'evening' | 'night'

// Ambient sky: five blob colors per time of day. Order matches BLOBS.
const PALETTES: Record<Daypart, string[]> = {
  morning:   ['#fbbf24', '#fb7185', '#38bdf8', '#a78bfa', '#fcd34d'],
  afternoon: ['#6366f1', '#8b5cf6', '#06b6d4', '#4f46e5', '#7c3aed'],
  evening:   ['#f97316', '#e11d48', '#7c3aed', '#a855f7', '#fb923c'],
  night:     ['#1e3a8a', '#4338ca', '#0e7490', '#312e81', '#4c1d95'],
}

function daypartFromHour(h: number): Daypart {
  if (h < 6) return 'night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

// Tilt a tile toward the cursor without a re-render (mutates the node directly).
function tilt(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  el.style.transform = `perspective(820px) rotateX(${-y * 5}deg) rotateY(${x * 6}deg) translateZ(6px)`
}
function untilt(e: React.MouseEvent<HTMLDivElement>) { e.currentTarget.style.transform = '' }

export default function HomePage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [greeting, setGreeting]     = useState('')
  const [userName, setUserName]     = useState('there')
  const [daypart, setDaypart]       = useState<Daypart>('afternoon')
  const [dateCard, setDateCard]     = useState<{ weekday: string; day: string; monthYear: string } | null>(null)
  const [quoteIdx, setQuoteIdx]     = useState(0)
  const [quoteVisible, setQuoteVisible] = useState(false)
  const [aiQuote, setAiQuote]       = useState<{ text: string; author: string; ai: boolean } | null>(null)

  const [weather, setWeather]       = useState<any>(null)
  const [briefing, setBriefing]     = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.name) setUserName(d.user.name.split(' ')[0])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    setDaypart(daypartFromHour(h))
    const now = new Date()
    setDateCard({
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      day: String(now.getDate()),
      monthYear: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    })
    setQuoteIdx(Math.floor(Math.random() * STATIC_QUOTES.length))
    setQuoteVisible(true)
  }, [])

  useEffect(() => {
    if (aiQuote) return
    const id = setInterval(() => {
      setQuoteVisible(false)
      setTimeout(() => {
        setQuoteIdx(i => (i + 1) % STATIC_QUOTES.length)
        setQuoteVisible(true)
      }, FADE_MS)
    }, QUOTE_INTERVAL)
    return () => clearInterval(id)
  }, [aiQuote])

  useEffect(() => {
    fetch('/api/home/quote')
      .then(r => r.json())
      .then(d => { if (d.quote) setAiQuote({ text: d.quote, author: d.author, ai: d.ai }) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchWeather = (lat?: number, lon?: number) => {
      const q = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : ''
      fetch(`/api/home/weather${q}`)
        .then(r => r.json())
        .then(d => { if (!d.error) setWeather(d) })
        .catch(() => {})
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        ()  => fetchWeather(),
      )
    } else {
      fetchWeather()
    }
  }, [])

  function generateBriefing() {
    if (briefingLoading) return
    setBriefingLoading(true)
    fetch('/api/home/briefing')
      .then(r => r.json())
      .then(d => setBriefing(d.briefing ?? null))
      .catch(() => setBriefing(null))
      .finally(() => setBriefingLoading(false))
  }

  const displayQuote = aiQuote ?? STATIC_QUOTES[quoteIdx]
  const showQuote    = aiQuote ? true : quoteVisible

  const weatherDesc = (cond: string, temp: number) => {
    const c = cond.toLowerCase()
    if (c.includes('thunder') || c.includes('storm')) return 'Thunderstorms'
    if (c.includes('heavy rain'))  return 'Heavy rain'
    if (c.includes('rain') || c.includes('drizzle')) return 'Rain expected'
    if (c.includes('snow'))        return 'Snowfall'
    if (c.includes('mist') || c.includes('fog') || c.includes('haze')) return 'Misty and hazy'
    if (c.includes('overcast'))    return 'Overcast'
    if (c.includes('cloud'))       return 'Partly cloudy'
    if (c.includes('sun') || c.includes('clear')) return temp > 35 ? 'Hot and sunny' : 'Bright and sunny'
    return cond
  }

  return (
    <>
      <style>{`
        .tp-card { transition: transform .4s cubic-bezier(.2,.7,.2,1), border-color .3s, box-shadow .4s; transform-style: preserve-3d; }
        .tp-halo { opacity: .5; transition: opacity .4s, transform .5s; }
        .tp-card:hover { border-color: color-mix(in srgb, var(--hue) 55%, transparent); box-shadow: 0 24px 60px -30px color-mix(in srgb, var(--hue) 85%, transparent); }
        .tp-card:hover .tp-halo { opacity: .9; transform: scale(1.18); }
        .tp-card:hover .tp-arrow { background: color-mix(in srgb, var(--hue) 22%, transparent); transform: translateX(3px); }
        .tp-card:focus-visible { outline: 2px solid var(--hue); outline-offset: 3px; }
        .tp-brief:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--home-card-border)); }
        .tp-launch { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        @media (max-width: 600px) { .tp-launch { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
        @media (max-width: 1180px) { .date-card, .weather-card { display: none !important; } }
        @keyframes tp-float { 0%,100%{transform:translateY(calc(-50% - 9px))} 50%{transform:translateY(calc(-50% + 9px))} }
        .date-card { position: absolute; left: 48px; top: 50%; transform: translateY(-50%); z-index: 1; animation: tp-float 16s ease-in-out infinite; }
        .weather-card { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); z-index: 1; animation: tp-float 16s ease-in-out infinite; animation-delay: -8s; }
        @media (prefers-reduced-motion: reduce) { .date-card, .weather-card, .tp-card { animation: none; transition: none; } }
      `}</style>

      <div style={{ minHeight: '100%', position: 'relative', background: 'var(--home-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>

        {/* Date card — left gutter */}
        {dateCard && (
          <div className="date-card" style={{ background: 'var(--home-card)', border: '1px solid var(--home-card-border)', borderRadius: '18px', padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: 'var(--sh-2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--home-t3)', letterSpacing: '0.06em', marginBottom: '6px' }}>{dateCard.weekday}</span>
            <span className="font-display" style={{ fontSize: '46px', fontWeight: 700, color: 'var(--home-t1)', lineHeight: 1, letterSpacing: '-0.03em' }}>{dateCard.day}</span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--home-t2)', marginTop: '8px', whiteSpace: 'nowrap' }}>{dateCard.monthYear}</span>
          </div>
        )}

        {/* Weather card — right gutter */}
        {weather && (
          <div className="weather-card" style={{ background: 'var(--home-card)', border: '1px solid var(--home-card-border)', borderRadius: '18px', padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: 'var(--sh-2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--home-t3)', letterSpacing: '0.06em', marginBottom: '6px', maxWidth: '120px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{weather.city || 'Weather'}</span>
            <span className="font-display" style={{ fontSize: '46px', fontWeight: 700, color: 'var(--home-t1)', lineHeight: 1, letterSpacing: '-0.03em' }}>{weather.temp}&deg;</span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--home-t2)', marginTop: '8px', whiteSpace: 'nowrap' }}>{weatherDesc(weather.condition, weather.temp)}</span>
            <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--home-t4)', marginTop: '4px', whiteSpace: 'nowrap' }}>Feels {weather.feelsLike}&deg; · {weather.humidity}%</span>
          </div>
        )}

        {/* Aurora blobs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {BLOBS.map((b, i) => (
            <div key={i} style={{ position: 'absolute', width: b.size, height: b.size, borderRadius: '50%', background: `radial-gradient(circle, ${PALETTES[daypart][i]}, transparent 68%)`, top: b.top, left: b.left, filter: 'blur(70px)', mixBlendMode: isDark ? 'screen' : 'normal', opacity: isDark ? b.opacity : b.opacity * 0.5, animation: b.anim, transition: 'background 1.5s ease' }} />
          ))}
          {isDark && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 30%, rgba(6,6,15,0.6) 100%)' }} />}
        </div>

        {/* Foreground */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '26px', padding: '52px 24px', width: '100%', maxWidth: '760px', boxSizing: 'border-box' }}>

          {/* Greeting */}
          <div style={{ textAlign: 'center' }}>
            <h1 className="font-display" style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)', fontWeight: 800, color: 'var(--home-t1)', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05 }} suppressHydrationWarning>
              {greeting ? `${greeting}, ${userName}.` : ' '}
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--home-t2)', margin: '10px 0 0' }}>Six tools, one calm surface. Pick up where you left off.</p>
          </div>

          {/* Daily briefing */}
          <div
            onClick={generateBriefing}
            className="tp-brief"
            title={briefingLoading ? undefined : briefing ? 'Click to regenerate' : 'Click to generate'}
            style={{ width: '100%', background: 'var(--home-card)', border: '1px solid var(--home-card-border)', borderRadius: '18px', padding: '16px 20px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', minHeight: '54px', cursor: briefingLoading ? 'default' : 'pointer', transition: 'border-color .25s', boxShadow: 'var(--sh-1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--accent)' }}>&#10022;</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>Daily briefing</span>
            </div>
            {briefingLoading
              ? <p style={{ fontSize: '13px', color: 'var(--home-t4)', margin: 0 }}>Generating your briefing&hellip;</p>
              : briefing
                ? <p style={{ fontSize: '13.5px', color: 'var(--home-t2)', margin: 0, lineHeight: 1.65 }}>{briefing}</p>
                : <p style={{ fontSize: '13px', color: 'var(--home-t3)', margin: 0 }}>Tap to generate today&rsquo;s briefing.</p>
            }
          </div>

          {/* App launcher — bento */}
          <div className="tp-launch" style={{ width: '100%' }}>
            {APPS.map(({ href, icon: Icon, label, hue, desc }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div
                  className="tp-card"
                  onMouseMove={tilt}
                  onMouseLeave={untilt}
                  style={{ ['--hue' as any]: hue, position: 'relative', overflow: 'hidden', background: 'var(--home-card)', border: '1px solid var(--home-card-border)', borderRadius: 'var(--radius)', padding: '18px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', cursor: 'pointer', boxShadow: 'var(--sh-1)', minHeight: '142px', display: 'flex', flexDirection: 'column' }}
                >
                  <span className="tp-halo" style={{ position: 'absolute', width: '130px', height: '130px', borderRadius: '50%', right: '-38px', top: '-46px', background: `radial-gradient(circle, ${hue}, transparent 70%)`, filter: 'blur(16px)', pointerEvents: 'none' }} />
                  <div style={{ width: '42px', height: '42px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${hue} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${hue} 40%, transparent)`, color: hue, boxShadow: `var(--tile-glow) ${hue}` }}>
                    <Icon size={21} />
                  </div>
                  <span className="font-display" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--home-t1)', marginTop: '14px', letterSpacing: '-0.02em' }}>{label}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--home-t3)', marginTop: '2px', lineHeight: 1.35 }}>{desc}</span>
                  <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--home-t4)', fontSize: '11.5px', fontWeight: 500 }}>
                    <span>Open</span>
                    <span className="tp-arrow" style={{ marginLeft: 'auto', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--home-card)', border: '1px solid var(--home-card-border)', color: hue, transition: 'background .3s, transform .3s' }}>
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Quote */}
          <div style={{ maxWidth: '540px', textAlign: 'center', opacity: showQuote ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, minHeight: '54px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <p className="font-serif" style={{ fontSize: '15px', fontStyle: 'italic', fontWeight: 500, color: 'var(--home-t2)', margin: 0, lineHeight: 1.6 }}>
              &ldquo;{displayQuote.text}&rdquo;
            </p>
            <span className="font-serif" style={{ fontSize: '12px', color: 'var(--home-t4)', letterSpacing: '0.04em' }}>
              {displayQuote.author}{aiQuote?.ai ? ' ✦' : ''}
            </span>
          </div>

        </div>
      </div>
    </>
  )
}
