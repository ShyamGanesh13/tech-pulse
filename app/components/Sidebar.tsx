'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Newspaper, FileText, CalendarDays, Wallet, Lock, LogOut, LayoutGrid, MessageSquare } from 'lucide-react'

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
  const isHome = pathname === '/home'

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile via CSS) ── */}
      <aside className="sidebar-desktop" style={{
        width: '64px',
        flexShrink: 0,
        background: '#0d0f12',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '14px',
        paddingBottom: '16px',
        height: '100vh',
      }}>
        <Link href="/home" style={{ textDecoration: 'none', marginBottom: '20px', flexShrink: 0 }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: isHome ? '#818cf8' : '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isHome ? '0 0 0 3px rgba(129,140,248,0.3)' : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}>
            <LayoutGrid size={16} color="white" />
          </div>
        </Link>

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
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                transition: 'background 0.15s',
              }}>
                <Icon size={20} color={active ? '#818cf8' : '#6b7280'} />
                <span style={{
                  fontSize: '9px',
                  letterSpacing: '0.06em',
                  color: active ? '#818cf8' : '#6b7280',
                  fontWeight: active ? 600 : 400,
                }}>
                  {label.toUpperCase()}
                </span>
              </Link>
            )
          })}
        </nav>

        <button onClick={logout} title="Sign out" style={{
          marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '40px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}>
          <LogOut size={18} color="#4b5563" />
        </button>
      </aside>

      {/* ── Mobile bottom nav (shown on mobile via CSS) ── */}
      <nav className="sidebar-mobile" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: '#0d0f12',
        borderTop: '1px solid rgba(255,255,255,0.08)',
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
            background: isHome ? '#818cf8' : '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <LayoutGrid size={14} color="white" />
          </div>
          <span style={{ fontSize: '9px', color: isHome ? '#818cf8' : '#6b7280', letterSpacing: '0.04em' }}>Home</span>
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
              <Icon size={20} color={active ? '#818cf8' : '#6b7280'} />
              <span style={{ fontSize: '9px', color: active ? '#818cf8' : '#6b7280', letterSpacing: '0.04em' }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
