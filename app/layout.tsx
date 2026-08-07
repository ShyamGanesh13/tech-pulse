import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/app/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Tech Pulse',
  description: 'Aggregated tech news from HN, Reddit, Dev.to, and Medium',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  )
}
