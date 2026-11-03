import type { MetadataRoute } from 'next'

// Thunai installs as a standalone app: launches at /home, dark aurora splash.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Thunai',
    short_name: 'Thunai',
    description: 'Your personal dashboard — news, notes, tasks, chat, finance and secrets in one place.',
    id: '/home',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0914',
    theme_color: '#0a0914',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
