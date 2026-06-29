export default function RemindersPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: '100vh',
      gap: '6px',
    }}>
      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Reminders</span>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Coming soon</span>
    </div>
  )
}
