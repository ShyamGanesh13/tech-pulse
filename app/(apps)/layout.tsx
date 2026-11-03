import Sidebar from '@/app/components/Sidebar'
import PushNotifications from '@/app/components/PushNotifications'

// No left rail: content is full-width and the app switcher floats as a dock
// (rendered by Sidebar). `.apps-main` reserves bottom room for that dock.
export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <PushNotifications />
      <main className="apps-main" style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        {children}
      </main>
      <Sidebar />
    </div>
  )
}
