'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Newspaper, FileText, CalendarDays, Wallet, Lock, LogOut, LayoutGrid, MessageSquare, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/app/components/ThemeProvider'

// The app switcher is a single floating glass dock pinned to the bottom-centre,
// on every screen size — there is no left rail anymore. Each app owns a signature
// hue; the active one lights up in that hue.
const NAV_ITEMS = [
  { href: '/thagaval', icon: Newspaper,    label: 'Thagaval', hue: 'var(--app-thagaval)' },
  { href: '/kuripu',   icon: FileText,      label: 'Kuripu',   hue: 'var(--app-kuripu)'   },
  { href: '/ninaivu',  icon: CalendarDays,  label: 'Ninaivu',  hue: 'var(--app-ninaivu)'  },
  { href: '/urai',     icon: MessageSquare, label: 'Urai',     hue: 'var(--app-urai)'     },
  { href: '/selvam',   icon: Wallet,        label: 'Selvam',   hue: 'var(--app-selvam)'   },
  { href: '/aran',     icon: Lock,          label: 'Aran',     hue: 'var(--app-aran)'     },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const isHome = pathname === '/home'

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  return (
    <>
      <style>{`
        .tp-dock {
          position: fixed; left: 50%; transform: translateX(-50%); z-index: 60;
          bottom: calc(18px + env(safe-area-inset-bottom, 0px));
          display: flex; align-items: center; gap: 4px; padding: 7px;
          background: var(--dock-bg);
          backdrop-filter: blur(22px) saturate(170%);
          -webkit-backdrop-filter: blur(22px) saturate(170%);
          border: 1px solid var(--dock-border); border-radius: 20px;
          box-shadow: var(--sh-3), 0 1px 0 rgba(255,255,255,0.10) inset;
          max-width: calc(100vw - 20px); overflow-x: auto; scrollbar-width: none;
        }
        .tp-dock::-webkit-scrollbar { display: none; }
        .tp-dock-btn {
          position: relative; flex: 0 0 auto; width: 42px; height: 42px;
          border-radius: 13px; border: 0; cursor: pointer; display: grid; place-items: center;
          background: transparent; color: var(--icon); text-decoration: none;
          transition: transform .22s cubic-bezier(.3,1.3,.5,1), background .2s, color .2s;
        }
        .tp-dock-btn:hover { transform: translateY(-6px); color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
        .tp-dock-btn:active { transform: translateY(-1px) scale(.94); }
        .tp-dock-btn:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
        .tp-dock-btn.on { color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
        .tp-dock-btn.on::after {
          content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%);
          width: 4px; height: 4px; border-radius: 50%; background: var(--c);
        }
        .tp-dock-sep { width: 1px; height: 26px; background: var(--hair); margin: 0 3px; flex: 0 0 auto; }
        @media (prefers-reduced-motion: reduce) { .tp-dock-btn { transition: none; } }
      `}</style>

      <nav className="tp-dock" aria-label="Apps">
        {/* Home — the aurora mark */}
        <Link href="/home" title="Home" aria-label="Home" className={`tp-dock-btn${isHome ? ' on' : ''}`} style={{ ['--c' as string]: 'var(--accent)' } as React.CSSProperties}>
          <span style={{ width: '22px', height: '22px', borderRadius: '7px', display: 'grid', placeItems: 'center',
            background: 'conic-gradient(from 140deg, var(--app-thagaval), var(--app-urai), var(--app-aran), var(--app-selvam), var(--app-kuripu), var(--app-ninaivu), var(--app-thagaval))' }}>
            <LayoutGrid size={12} color="#fff" />
          </span>
        </Link>

        {NAV_ITEMS.map(({ href, icon: Icon, label, hue }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} title={label} aria-label={label}
              className={`tp-dock-btn${active ? ' on' : ''}`}
              style={{ ['--c' as string]: hue } as React.CSSProperties}>
              <Icon size={20} />
            </Link>
          )
        })}

        <span className="tp-dock-sep" />

        <button onClick={toggle} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme"
          className="tp-dock-btn" style={{ ['--c' as string]: 'var(--accent)' } as React.CSSProperties}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={logout} title="Sign out" aria-label="Sign out"
          className="tp-dock-btn" style={{ ['--c' as string]: 'var(--crit)' } as React.CSSProperties}>
          <LogOut size={18} />
        </button>
      </nav>
    </>
  )
}
