'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Newspaper, FileText, CalendarDays, Wallet, Lock, LogOut, LayoutGrid, MessageSquare, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/app/components/ThemeProvider'

interface UserInfo { name: string; email: string; picture: string | null }

const NAV_ITEMS = [
  { href: '/thagaval', icon: Newspaper,     label: 'Thagaval' },
  { href: '/kuripu',   icon: FileText,       label: 'Kuripu'   },
  { href: '/ninaivu',  icon: CalendarDays,   label: 'Ninaivu'  },
  { href: '/urai',     icon: MessageSquare,  label: 'Urai'     },
  { href: '/selvam',   icon: Wallet,         label: 'Selvam'   },
  { href: '/vault',    icon: Lock,           label: 'Vault'    },
]

// Icon button — sets CSS color on the wrapper so icons inherit via currentColor.
// Passing CSS vars directly as SVG stroke/color attributes fails on Safari.
function IconBtn({ onClick, title, cssColor, children }: {
  onClick?: () => void; title?: string; cssColor: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '36px', background: 'transparent', border: 'none',
      cursor: 'pointer', color: cssColor,
    }}>
      {children}
    </button>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const isHome = pathname === '/home'
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user ?? null)).catch(() => {})
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar-desktop" style={{
        width: '64px',
        flexShrink: 0,
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--border-s)',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '14px',
        paddingBottom: '16px',
        height: '100vh',
      }}>
        {/* Logo */}
        <Link href="/home" style={{ textDecoration: 'none', marginBottom: '20px', flexShrink: 0 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isHome ? '0 0 0 3px var(--accent-bg)' : 'none',
            transition: 'box-shadow 0.15s',
          }}>
            <LayoutGrid size={16} color="white" />
          </div>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0 8px' }}>
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '4px',
                height: '52px', borderRadius: '8px', textDecoration: 'none',
                background: active ? 'var(--nav-active)' : 'transparent',
                // Set CSS color here so icons inherit via currentColor (Safari-safe)
                color: active ? 'var(--accent)' : 'var(--icon)',
                transition: 'background 0.15s',
              }}>
                <Icon size={20} />
                <span style={{
                  fontSize: '9px', letterSpacing: '0.06em',
                  fontWeight: active ? 600 : 400,
                  color: 'inherit',
                }}>
                  {label.toUpperCase()}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {/* Theme toggle */}
          <IconBtn onClick={toggle} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} cssColor="var(--icon)">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconBtn>

          {/* Profile picture — same 36px tap-target as the icon buttons */}
          {user?.picture && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '36px' }}>
              <img
                src={user.picture} alt={user.name} title={user.name}
                referrerPolicy="no-referrer"
                style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-s)' }}
              />
            </div>
          )}

          {/* Sign out */}
          <IconBtn onClick={logout} title="Sign out" cssColor="var(--icon-m)">
            <LogOut size={18} />
          </IconBtn>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="sidebar-mobile" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '60px',
        background: 'var(--surface-1)', borderTop: '1px solid var(--border-s)',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Home */}
        <Link href="/home" style={{
          textDecoration: 'none', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '3px', flex: 1,
          color: isHome ? 'var(--accent)' : 'var(--icon)',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LayoutGrid size={14} color="white" />
          </div>
          <span style={{ fontSize: '9px', letterSpacing: '0.04em', color: 'inherit' }}>Home</span>
        </Link>

        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} style={{
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '3px', flex: 1,
              color: active ? 'var(--accent)' : 'var(--icon)',
            }}>
              <Icon size={20} />
              <span style={{ fontSize: '9px', letterSpacing: '0.04em', color: 'inherit' }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
