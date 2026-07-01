'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Newspaper, FileText, CalendarDays, TrendingUp, Lock, ArrowUp, Mic, Plus } from 'lucide-react'

const APPS = [
  { href: '/tech-pulse', icon: Newspaper,   label: 'Pulse',     color: '#6366f1', desc: 'Tech news feed' },
  { href: '/notes',      icon: FileText,     label: 'Notes',     color: '#06b6d4', desc: 'Rich text notes' },
  { href: '/reminders',  icon: CalendarDays, label: 'Reminders', color: '#8b5cf6', desc: 'Tasks & focus' },
  { href: '/finance',    icon: TrendingUp,   label: 'Finance',   color: '#10b981', desc: 'Budget & insights' },
  { href: '/vault',      icon: Lock,         label: 'Vault',     color: '#f59e0b', desc: 'Coming soon' },
]

const QUICK_PROMPTS = [
  { label: 'Finance summary',   prompt: 'Give me a summary of my finances this month.' },
  { label: "What's due today?", prompt: 'What reminders and todos do I have for today?' },
  { label: 'Summarise notes',   prompt: 'Summarise my recent notes for me.' },
  { label: 'Tech headlines',    prompt: 'What are the latest tech news highlights?' },
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

const BLOBS = [
  { color: '#6366f1', size: 560, top: '2%',  left: '4%',  anim: 'blob1 22s ease-in-out infinite', opacity: 0.18 },
  { color: '#8b5cf6', size: 500, top: '-8%', left: '62%', anim: 'blob2 29s ease-in-out infinite', opacity: 0.14 },
  { color: '#06b6d4', size: 420, top: '58%', left: '12%', anim: 'blob3 19s ease-in-out infinite', opacity: 0.11 },
  { color: '#4f46e5', size: 580, top: '42%', left: '54%', anim: 'blob4 33s ease-in-out infinite', opacity: 0.13 },
  { color: '#7c3aed', size: 380, top: '72%', left: '78%', anim: 'blob5 25s ease-in-out infinite', opacity: 0.09 },
]

interface ChatMsg { role: 'user' | 'assistant'; content: string }

export default function HomePage() {
  const [greeting, setGreeting]     = useState('')
  const [date, setDate]             = useState('')
  const [quoteIdx, setQuoteIdx]     = useState(0)
  const [quoteVisible, setQuoteVisible] = useState(false)
  const [aiQuote, setAiQuote]       = useState<{ text: string; author: string; ai: boolean } | null>(null)
  const [hovered, setHovered]       = useState<string | null>(null)

  // Weather
  const [weather, setWeather]       = useState<any>(null)

  // Briefing
  const [briefing, setBriefing]     = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)

  // Chat
  const [chatInput, setChatInput]   = useState('')
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const chatEndRef    = useRef<HTMLDivElement>(null)
  const chatInputRef  = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  // Init greeting + date
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    setDate(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    setQuoteIdx(Math.floor(Math.random() * STATIC_QUOTES.length))
    setQuoteVisible(true)
  }, [])

  // Rotate static quotes
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

  // Fetch AI quote
  useEffect(() => {
    fetch('/api/home/quote')
      .then(r => r.json())
      .then(d => { if (d.quote) setAiQuote({ text: d.quote, author: d.author, ai: d.ai }) })
      .catch(() => {})
  }, [])

  // Fetch weather
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

  // Fetch briefing
  useEffect(() => {
    setBriefingLoading(true)
    fetch('/api/home/briefing')
      .then(r => r.json())
      .then(d => setBriefing(d.briefing ?? null))
      .catch(() => setBriefing(null))
      .finally(() => setBriefingLoading(false))
  }, [])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs])

  const displayQuote = aiQuote ?? STATIC_QUOTES[quoteIdx]
  const showQuote    = aiQuote ? true : quoteVisible

  async function sendChat(overrideMsg?: string) {
    const msg = (overrideMsg ?? chatInput).trim()
    if (!msg || chatLoading) return
    const newMsgs: ChatMsg[] = [...chatMsgs, { role: 'user', content: msg }]
    setChatMsgs(newMsgs)
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/home/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMsgs, message: msg }),
      })
      const d = await res.json()
      setChatMsgs(prev => [...prev, { role: 'assistant', content: d.reply }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: 'Something went wrong — try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.continuous = false
    r.interimResults = false
    r.lang = 'en-US'
    r.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript
      setChatInput(prev => prev ? `${prev} ${transcript}` : transcript)
      setIsListening(false)
    }
    r.onerror = () => setIsListening(false)
    r.onend   = () => setIsListening(false)
    r.start()
    recognitionRef.current = r
    setIsListening(true)
  }

  const weatherOneliner = (cond: string, temp: number, city: string) => {
    const c = cond.toLowerCase()
    let desc = ''
    if (c.includes('thunder') || c.includes('storm')) desc = 'Thunderstorms expected'
    else if (c.includes('heavy rain'))  desc = 'Heavy rain today'
    else if (c.includes('rain') || c.includes('drizzle')) desc = 'Rain expected'
    else if (c.includes('snow'))        desc = 'Snowfall expected'
    else if (c.includes('mist') || c.includes('fog') || c.includes('haze')) desc = 'Misty and hazy'
    else if (c.includes('overcast'))    desc = 'Overcast skies'
    else if (c.includes('cloud'))       desc = 'Partly cloudy'
    else if (c.includes('sun') || c.includes('clear')) desc = temp > 35 ? 'Hot and sunny' : 'Bright sunny day'
    else desc = cond
    return `${desc} in ${city} · ${temp}°C`
  }

  return (
    <>
      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(70px,-55px) scale(1.10)} 66%{transform:translate(-35px,45px) scale(0.94)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-65px,75px) scale(1.06)} 70%{transform:translate(55px,-30px) scale(0.91)} }
        @keyframes blob3 { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(55px,55px) scale(1.09)} 75%{transform:translate(-75px,-40px) scale(0.93)} }
        @keyframes blob4 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-45px,-65px) scale(1.12)} }
        @keyframes blob5 { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(85px,45px) scale(0.88)} 80%{transform:translate(-30px,-55px) scale(1.07)} }
        .chat-bubble-user { background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.35); border-radius: 12px 12px 4px 12px; padding: 8px 12px; max-width: 82%; align-self: flex-end; }
        .chat-bubble-ai { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px 12px 12px 4px; padding: 8px 12px; max-width: 82%; align-self: flex-start; }
        .quick-pill:hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(255,255,255,0.2) !important; color: rgba(249,250,251,0.85) !important; }
        .app-card:hover { transform: translateY(-3px); }
        textarea::-webkit-scrollbar { display: none; }
        textarea { scrollbar-width: none; }
      `}</style>

      <div style={{ minHeight: '100%', position: 'relative', background: '#030712', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

        {/* Blobs */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {BLOBS.map((b, i) => (
            <div key={i} style={{ position: 'absolute', width: b.size, height: b.size, borderRadius: '50%', background: b.color, top: b.top, left: b.left, filter: 'blur(96px)', opacity: b.opacity, animation: b.anim }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 25%, rgba(3,7,18,0.65) 100%)' }} />
        </div>

        {/* Foreground */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '48px 40px', width: '100%', maxWidth: '680px', boxSizing: 'border-box' }}>

          {/* Greeting + weather */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '38px', fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }} suppressHydrationWarning>
              {greeting ? `${greeting}, Shyam.` : ' '}
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(249,250,251,0.4)', marginTop: '8px', fontWeight: 400 }} suppressHydrationWarning>
              {date}
            </p>
            {weather && (
              <p style={{ fontSize: '12px', color: 'rgba(249,250,251,0.3)', marginTop: '5px' }}>
                {weatherOneliner(weather.condition, weather.temp, weather.city)}
              </p>
            )}
          </div>

          {/* Daily briefing */}
          <div style={{ width: '100%', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '16px 20px', backdropFilter: 'blur(8px)', minHeight: '54px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px' }}>✦</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Daily Briefing</span>
            </div>
            {briefingLoading
              ? <p style={{ fontSize: '13px', color: 'rgba(249,250,251,0.35)', margin: 0 }}>Generating your briefing…</p>
              : briefing
                ? <p style={{ fontSize: '13px', color: 'rgba(249,250,251,0.7)', margin: 0, lineHeight: 1.65 }}>{briefing}</p>
                : <p style={{ fontSize: '13px', color: 'rgba(249,250,251,0.3)', margin: 0 }}>Connect to Ollama to get your daily briefing.</p>
            }
          </div>

          {/* Quote */}
          <div style={{ maxWidth: '520px', textAlign: 'center', opacity: showQuote ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, minHeight: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <p style={{ fontSize: '14px', fontStyle: 'italic', fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400, color: 'rgba(249,250,251,0.6)', margin: 0, lineHeight: 1.65 }}>
              &ldquo;{displayQuote.text}&rdquo;
            </p>
            <span style={{ fontSize: '11px', color: 'rgba(249,250,251,0.28)', fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: '0.05em' }}>
              — {displayQuote.author}{aiQuote?.ai ? ' ✦' : ''}
            </span>
          </div>

          {/* App launcher */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {APPS.map(({ href, icon: Icon, label, color, desc }) => {
              const isH = hovered === href
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }} onMouseEnter={() => setHovered(href)} onMouseLeave={() => setHovered(null)}>
                  <div className="app-card" style={{ background: isH ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.045)', border: `1px solid ${isH ? color + '70' : 'rgba(255,255,255,0.1)'}`, borderRadius: '14px', padding: '20px 16px', width: '96px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', cursor: 'pointer', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', transition: 'border-color 0.15s, transform 0.15s, background 0.15s' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: color + '28', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={19} color={color} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(249,250,251,0.85)', letterSpacing: '-0.01em' }}>{label}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(249,250,251,0.38)', textAlign: 'center', lineHeight: 1.3 }}>{desc}</span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Chat section */}
          <div style={{ width: '100%' }}>

            {/* Message history */}
            {chatMsgs.length > 0 && (
              <div style={{ marginBottom: '12px', maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
                {chatMsgs.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'} style={{ fontSize: '13px', color: 'rgba(249,250,251,0.85)', lineHeight: 1.6 }}>
                    {m.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-bubble-ai" style={{ fontSize: '13px', color: 'rgba(249,250,251,0.4)' }}>Thinking…</div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input card */}
            <div style={{ background: 'rgba(20,20,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                placeholder="How can I help you today?"
                rows={2}
                suppressHydrationWarning
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: '16px 16px 10px', fontSize: '14px', color: 'rgba(249,250,251,0.85)', fontFamily: 'inherit', resize: 'none', caretColor: '#a78bfa', boxSizing: 'border-box', lineHeight: 1.6, display: 'block' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px' }}>
                <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                  <Plus size={14} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={toggleVoice}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                    style={{ background: isListening ? 'rgba(99,102,241,0.3)' : 'transparent', border: 'none', borderRadius: '8px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: isListening ? '#a78bfa' : 'rgba(255,255,255,0.45)', transition: 'background 0.15s, color 0.15s' }}
                  >
                    <Mic size={16} />
                  </button>
                  <button
                    onClick={() => sendChat()}
                    disabled={!chatInput.trim() || chatLoading}
                    style={{ background: chatInput.trim() && !chatLoading ? '#6366f1' : 'rgba(99,102,241,0.18)', border: 'none', borderRadius: '8px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default', transition: 'background 0.15s', flexShrink: 0 }}
                  >
                    <ArrowUp size={16} color="#fff" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick action pills */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {QUICK_PROMPTS.map(({ label, prompt }) => (
                <button
                  key={label}
                  className="quick-pill"
                  onClick={() => { setChatInput(prompt); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '6px 14px', fontSize: '12px', color: 'rgba(249,250,251,0.55)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
