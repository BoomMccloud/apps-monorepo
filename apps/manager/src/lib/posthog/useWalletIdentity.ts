import type { AnalyticsConsentState } from '@ens-apps/utils/analytics-consent-context'
import { useEffect } from 'react'
import { type ConnectedWallet, identifyWallet } from './identity'

/**
 * After Accept, the visitor is identified by their wallet, whether it was
 * connected before the press, connected later, or restored on a later visit.
 */
export const useWalletIdentity = (
  consent: AnalyticsConsentState,
  wallet: ConnectedWallet | null,
): void => {
  const address = wallet?.address
  const chainId = wallet?.chainId
  const connectorName = wallet?.connectorName
  useEffect(() => {
    if (consent !== 'granted' || !address) return
    identifyWallet({ address, chainId, connectorName })
  }, [consent, address, chainId, connectorName])
}
