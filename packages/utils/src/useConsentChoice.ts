import { useEffect, useRef, useState } from 'react'
import {
  type AnalyticsClient,
  type AnalyticsConsent,
  acceptAnalytics,
  analyticsStartupConfig,
  type ConnectedWallet,
  declineAnalytics,
  followStoredChoice,
  identifyWallet,
} from './analyticsConsent'
import type {
  AnalyticsConsentState,
  AnalyticsConsentValue,
} from './analyticsConsentContext'
import { LEGACY_POSTHOG_PROJECT_KEYS } from './analyticsLegacyStorage'
import { startAnalyticsSdk } from './analyticsStart'
import posthog from './postHogClient'
import { createSupportChat } from './supportChat'
import { useWalletAnalytics, type WagmiHooks } from './useWalletAnalytics'

/**
 * Once the SDK has started, follow a choice made in another tab or another
 * ENS app (`followStoredChoice`), and hand each one to the page.
 */
const useFollowedChoice = (
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

/**
 * After Accept, the visitor is identified by their wallet, whether it was
 * connected before the press, connected later, or restored on a later visit.
 * `onIdentified` runs after each identify, for what follows the visitor's id.
 */
const useWalletIdentity = (
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

type ConsentChoiceOptions = {
  /** The app's own wagmi hooks, which this package takes rather than holds. */
  readonly wagmi: WagmiHooks
  readonly intercomAppId: string
  /** The PostHog project's key. Without one the SDK is not started, and the page shows no choice. */
  readonly projectKey: string | undefined
  readonly apiHost: string | undefined
  readonly isDev: boolean
  /** Whether the page may start the SDK yet; the default is that it may. */
  readonly isReady?: boolean
  /** The feature switches the server decided, which the SDK starts with. An app that reads none passes none. */
  readonly bootstrapSwitches?: Readonly<Record<string, boolean>>
  /** Runs once the SDK has forgotten the visitor: after a Decline and on a wallet disconnect. */
  readonly onVisitorReset?: () => void
}

/**
 * The visitor's analytics choice for an ENS app, headless: it starts the SDK
 * once the page is ready, keeps the choice, and returns it with the two steps
 * that change it, `accept` and `decline`, for the context the banner and the
 * notice read (`AnalyticsConsentContext`). A choice made in another tab or app
 * is followed as one pressed here. It also identifies the connected wallet
 * after Accept and records a wallet connecting and disconnecting
 * (`useWalletAnalytics`), and it ties the support chat to the visitor's
 * analytics, and unties it, as the choice moves.
 */
export const useConsentChoice = ({
  wagmi,
  intercomAppId,
  projectKey,
  apiHost,
  isDev,
  isReady = true,
  bootstrapSwitches,
  onVisitorReset,
}: ConsentChoiceOptions): AnalyticsConsentValue => {
  const { address, chainId, connector } = wagmi.useConnection()
  const [consent, setConsent] = useState<AnalyticsConsentState>('unknown')
  const [supportChat] = useState(() =>
    createSupportChat({ appId: intercomAppId, analytics: posthog }),
  )

  useEffect(() => {
    if (!isReady) return
    const started = projectKey
      ? startAnalyticsSdk(
          posthog,
          projectKey,
          analyticsStartupConfig({ apiHost, bootstrapSwitches }),
          { isDev, legacyProjectKeys: LEGACY_POSTHOG_PROJECT_KEYS },
        )
      : 'unknown'
    setConsent(started)
    supportChat.bootSupportChat(started)
  }, [isReady, projectKey, apiHost, isDev, bootstrapSwitches, supportChat])

  useWalletIdentity(
    posthog,
    consent,
    address ? { address, chainId, connectorName: connector?.name } : null,
    supportChat.relinkSupportChat,
  )

  // What the page does about a choice, whether the visitor pressed it here or
  // it was made in another tab or app.
  const applyChoice = (choice: AnalyticsConsent): void => {
    setConsent(choice)
    if (choice === 'granted') {
      supportChat.linkSupportChat()
      return
    }
    supportChat.unlinkSupportChat()
    // The reset that clears the visitor id also empties what the app keeps
    // of it, such as the switches decided for the visitor.
    if (choice === 'denied') onVisitorReset?.()
  }

  useFollowedChoice(posthog, consent !== 'unknown', isDev, applyChoice)
  useWalletAnalytics({
    wagmi,
    relinkSupportChat: supportChat.relinkSupportChat,
    onVisitorReset,
  })

  return {
    consent,
    accept: () => {
      void acceptAnalytics(posthog, { isDev })
      applyChoice('granted')
    },
    decline: () => {
      declineAnalytics(posthog)
      applyChoice('denied')
    },
  }
}
