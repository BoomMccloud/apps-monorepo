import { useEffect } from 'react'
import {
  type AnalyticsClient,
  type ConnectedWallet,
  identifyWallet,
} from './analyticsConsent'
import type { AnalyticsConsentState } from './analyticsConsentContext'

/**
 * After Accept, the visitor is identified by their wallet, whether it was
 * connected before the press, connected later, or restored on a later visit.
 * `onIdentified` runs after each identify, for what follows the visitor's id.
 */
export const useWalletIdentity = (
  client: AnalyticsClient,
  consent: AnalyticsConsentState,
  wallet: ConnectedWallet | null,
  onIdentified?: () => void,
): void => {
  const address = wallet?.address
  const chainId = wallet?.chainId
  const connectorName = wallet?.connectorName
  useEffect(() => {
    if (consent !== 'granted' || !address) return
    identifyWallet(client, { address, chainId, connectorName })
    onIdentified?.()
  }, [client, consent, address, chainId, connectorName, onIdentified])
}
