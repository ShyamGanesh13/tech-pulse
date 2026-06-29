'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Newspaper, FileText, CalendarDays, TrendingUp, Lock, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/tech-pulse', icon: Newspaper, label: 'PULSE' },
  { href: '/notes', icon: FileText, label: 'NOTES' },
  { href: '/reminders', icon: CalendarDays, label: 'REMIND' },
  { href: '/finance', icon: TrendingUp, label: 'FINANCE' },
  { href: '/vault', icon: Lock, label: 'VAULT' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: '64px',
      flexShrink: 0,
      background: '#0d0f12',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '14px',
      paddingBottom: '16px',
      height: '100vh',
    }}>
      {/* Logo placeholder */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: '#6366f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px',
        color: 'white',
        fontSize: '14px',
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}>
        W
      </div>

      {/* Nav items */}
      <nav style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        width: '100%',
        padding: '0 8px',
      }}>
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
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
              }}
            >
              <Icon size={20} color={active ? '#818cf8' : '#6b7280'} />
              <span style={{
                fontSize: '9px',
                letterSpacing: '0.06em',
                color: active ? '#818cf8' : '#6b7280',
                fontWeight: active ? 600 : 400,
                fontFamily: 'inherit',
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Settings pinned to bottom */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <Settings size={18} color="#4b5563" />
      </div>
    </aside>
  )
}
