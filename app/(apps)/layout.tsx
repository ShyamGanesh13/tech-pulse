import Sidebar from '@/app/components/Sidebar'
import PushNotifications from '@/app/components/PushNotifications'

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <PushNotifications />
      <Sidebar />
      <main className="apps-main" style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
