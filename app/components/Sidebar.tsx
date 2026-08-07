'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Newspaper, FileText, CalendarDays, Wallet, Lock, LogOut, LayoutGrid, MessageSquare, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/app/components/ThemeProvider'

interface UserInfo { name: string; email: string; picture: string | null }

const NAV_ITEMS = [
  { href: '/thagaval', icon: Newspaper, label: 'Thagaval' },
  { href: '/kuripu', icon: FileText, label: 'Kuripu' },
  { href: '/ninaivu', icon: CalendarDays, label: 'Ninaivu' },
  { href: '/urai', icon: MessageSquare, label: 'Urai' },
  { href: '/selvam', icon: Wallet, label: 'Selvam' },
  { href: '/vault', icon: Lock, label: 'Vault' },
]

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
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: isHome ? 'var(--accent)' : 'var(--logo-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isHome ? '0 0 0 3px var(--accent-bg)' : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}>
            <LayoutGrid size={16} color="white" />
          </div>
        </Link>

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0 8px' }}>
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                height: '52px',
                borderRadius: '8px',
                textDecoration: 'none',
                background: active ? 'var(--nav-active)' : 'transparent',
                transition: 'background 0.15s',
              }}>
                <Icon size={20} color={active ? 'var(--accent)' : 'var(--icon)'} />
                <span style={{
                  fontSize: '9px',
                  letterSpacing: '0.06em',
                  color: active ? 'var(--accent)' : 'var(--icon)',
                  fontWeight: active ? 600 : 400,
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
          <button onClick={toggle} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer',
          }}>
            {theme === 'dark'
              ? <Sun size={16} color="var(--icon)" />
              : <Moon size={16} color="var(--icon)" />}
          </button>

          {/* Profile picture */}
          {user?.picture && (
            <img
              src={user.picture}
              alt={user.name}
              title={user.name}
              referrerPolicy="no-referrer"
              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-s)' }}
            />
          )}

          {/* Sign out */}
          <button onClick={logout} title="Sign out" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer',
          }}>
            <LogOut size={18} color="var(--icon-m)" />
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="sidebar-mobile" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border-s)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Home */}
        <Link href="/home" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flex: 1 }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'var(--logo-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <LayoutGrid size={14} color="white" />
          </div>
          <span style={{ fontSize: '9px', color: isHome ? 'var(--accent)' : 'var(--icon)', letterSpacing: '0.04em' }}>Home</span>
        </Link>

        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} style={{
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              flex: 1,
            }}>
              <Icon size={20} color={active ? 'var(--accent)' : 'var(--icon)'} />
              <span style={{ fontSize: '9px', color: active ? 'var(--accent)' : 'var(--icon)', letterSpacing: '0.04em' }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
