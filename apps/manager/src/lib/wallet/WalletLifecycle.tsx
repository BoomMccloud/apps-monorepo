import { transactionManager } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { backendAuthStore } from '@/utils/backend-client'
import { clearAppLocalStorage } from './clearAppLocalStorage'

// Drops stale backend auth + transactions on an account switch, and tears
// everything down on disconnect. Renders nothing.
export const WalletLifecycle = () => {
  const { address } = useConnection()

  useEffect(() => {
    if (!address) return

    const authedAddress = backendAuthStore.get().context.address
    if (
      authedAddress &&
      authedAddress.toLowerCase() !== address.toLowerCase()
    ) {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
    }
  }, [address])

  useConnectionEffect({
    onDisconnect() {
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
      clearAppLocalStorage()
      // PostHog's own disconnect handling (the event and the visitor reset
      // that keeps the analytics choice) lives in PHProvider.
    },
  })

  return null
}
