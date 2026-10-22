import { useState } from 'react'
import { useConnection } from 'wagmi'

/**
 * Whether wagmi has finished restoring the stored connection, so that its
 * state says who is connected. wagmi reports "disconnected" until the page has
 * mounted and it has read the stored connection, then "reconnecting" or
 * "connecting", then where that ends. The first "disconnected" says nothing
 * about the visitor; a later one does. Mount it once at the root: mounted after
 * a restore that ended with no wallet, it stays false.
 */
export const useIsConnectionSettled = (): boolean => {
  const { status } = useConnection()
  const [hasRestoreStarted, setHasRestoreStarted] = useState(
    status !== 'disconnected',
  )
  if (status !== 'disconnected' && !hasRestoreStarted) {
    setHasRestoreStarted(true)
  }
  return (
    hasRestoreStarted && (status === 'connected' || status === 'disconnected')
  )
}
