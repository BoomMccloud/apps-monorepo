import { createContext, useContext, useEffect, useRef } from 'react'
import {
  type AnalyticsClient,
  type AnalyticsConsent,
  type ConnectedWallet,
  followStoredChoice,
  identifyWallet,
} from './analyticsConsent'

/** The choice as the page knows it; `unknown` until the SDK has started. */
export type AnalyticsConsentState = AnalyticsConsent | 'unknown'

type AnalyticsConsentValue = {
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

/**
 * Once the SDK has started, follow a choice made in another tab or another
 * ENS app (`followStoredChoice`), and hand each one to the page.
 */
export const useFollowedChoice = (
  client: AnalyticsClient,
  isStarted: boolean,
  isDev: boolean,
  onChange: (consent: AnalyticsConsent) => void,
): void => {
  // The page's latest handler, read when a change arrives, so the follower
  // does not restart each time the page renders a new one.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (!isStarted) return
    return followStoredChoice(client, {
      isDev,
      onChange: (consent) => onChangeRef.current(consent),
    })
  }, [client, isStarted, isDev])
}
