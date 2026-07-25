'use client'

import { VaultProvider, useVault } from './VaultContext'
import UnlockGate from './UnlockGate'
import VaultMain from './VaultMain' // stub in Task 5, filled in Task 6

function Inner() {
  const { status } = useVault()
  if (status !== 'unlocked') return <UnlockGate />
  return <VaultMain />
}

export default function VaultPage() {
  return (
    <VaultProvider>
      <Inner />
    </VaultProvider>
  )
}
