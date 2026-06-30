import Sidebar from '@/app/components/Sidebar'

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main className="apps-main" style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
