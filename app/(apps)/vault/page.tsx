export default function VaultPage() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0, height: '36px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em' }}>Vault</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Coming soon</span>
      </div>
    </div>
  )
}
