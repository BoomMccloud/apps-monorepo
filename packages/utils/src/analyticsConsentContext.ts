import { createContext, useContext, useEffect } from 'react'
import {
  type AnalyticsClient,
  type AnalyticsConsent,
  type ConnectedWallet,
  identifyWallet,
} from './analyticsConsent'

/** The choice as the page knows it; `unknown` until the SDK has started. */
export type AnalyticsConsentState = AnalyticsConsent | 'unknown'

export type AnalyticsConsentValue = {
  readonly consent: AnalyticsConsentState
  readonly accept: () => void
  readonly decline: () => void
}

/**
 * The visitor's choice for the banner and the notice. Each app's PostHog
 * provider supplies it, since PostHog emits nothing when the choice changes.
 */
export const AnalyticsConsentContext = createContext<AnalyticsConsentValue>({
  consent: 'unknown',
  accept: () => {},
  decline: () => {},
})

export const useAnalyticsConsent = (): AnalyticsConsentValue =>
  useContext(AnalyticsConsentContext)

/**
 * After Accept, the visitor is identified by their wallet, whether it was
 * connected before the press, connected later, or restored on a later visit.
 */
export const useWalletIdentity = (
  client: AnalyticsClient,
  consent: AnalyticsConsentState,
  wallet: ConnectedWallet | null,
): void => {
  const address = wallet?.address
  const chainId = wallet?.chainId
  const connectorName = wallet?.connectorName
  useEffect(() => {
    if (consent !== 'granted' || !address) return
    identifyWallet(client, { address, chainId, connectorName })
  }, [client, consent, address, chainId, connectorName])
}
