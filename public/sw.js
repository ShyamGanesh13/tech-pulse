self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'Nyabagam', body: '' } }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: payload.tag || 'nyabagam',
      requireInteraction: true,
      data: { url: payload.url || '/ninaivu' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/ninaivu'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
