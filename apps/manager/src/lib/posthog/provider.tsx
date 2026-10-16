import {
  acceptAnalytics,
  declineAnalytics,
  identifyWallet,
  resetVisitor,
} from '@ens-apps/utils/analyticsConsent'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
  useFollowedChoice,
  useWalletIdentity,
} from '@ens-apps/utils/analyticsConsentContext'
import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { PostHogProvider } from '@posthog/react'
import { useQueryClient } from '@tanstack/react-query'
import { rootRouteId, useHydrated, useLoaderData } from '@tanstack/react-router'
// @posthog/react types its `client` prop with the `PostHog` type from the
// default `posthog-js` build, which is a *nominally* distinct declaration from
// the no-external build's `PostHog`. Import that type to cast at the provider
// boundary below.
import type { PostHog } from 'posthog-js'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useState } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from './events'
import { ALL_SWITCHES_OFF } from './feature-flags'
import { getFeatureSwitchesQueryOptions } from './featureSwitches.query'
import { linkSupportChat } from './supportChat'
import {
  pushFeatureSwitches,
  useFeatureSwitchSync,
} from './useFeatureSwitchSync'
import { usePostHogStart } from './usePostHogStart'

/**
 * PostHog for the Manager: analytics only after the visitor accepts, feature
 * switches always from the server, and the visitor's choice for the banner
 * and the notice.
 */
export const PHProvider = ({
  children,
}: {
  readonly children: React.ReactNode
}): React.ReactNode => {
  const isHydrated = useHydrated()
  const switches = useLoaderData({ from: rootRouteId })
  const { address, chainId, connector, status } = useConnection()
  const queryClient = useQueryClient()
  const [consent, setConsent] = useState<AnalyticsConsentState>('unknown')
  const wallet = address ?? null
  // The server's answers this page already holds for a wallet, or for none.
  const knownSwitches = (forWallet: string | null) =>
    queryClient.getQueryData(getFeatureSwitchesQueryOptions(forWallet).queryKey)

  usePostHogStart(isHydrated, switches, setConsent)
  useFollowedChoice(
    posthog,
    consent !== 'unknown',
    import.meta.env.DEV,
    (followed) => {
      setConsent(followed)
      if (followed === 'granted') linkSupportChat()
      // The decline followed here reset the SDK, which empties the switches.
      if (followed === 'denied') {
        pushFeatureSwitches(knownSwitches(wallet) ?? switches)
      }
    },
  )
  useWalletIdentity(
    posthog,
    consent,
    address ? { address, chainId, connectorName: connector?.name } : null,
  )
  useFeatureSwitchSync(
    wallet,
    status === 'connected' || status === 'disconnected',
  )

  useConnectionEffect({
    onConnect(data) {
      // Analytics are non-critical; never let them crash the app.
      try {
        identifyWallet(posthog, {
          address: data.address,
          chainId: data.chainId,
          connectorName: data.connector.name,
        })
        track('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[posthog] wallet:connect failed', error)
      }

      try {
        trackIntercomEvent('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[intercom] wallet:connect failed', error)
      }
    },
    onDisconnect() {
      // A new visitor id for whoever uses the browser next; the choice stays.
      // The reset empties the switches, and the page would then show those it
      // started with, decided for the wallet that just left: the answers for
      // a visitor with no wallet go in at once, or all off until the server
      // has given them.
      try {
        track('wallet:disconnect')
        resetVisitor(posthog)
        pushFeatureSwitches(knownSwitches(null) ?? ALL_SWITCHES_OFF)
      } catch (error) {
        console.warn('[posthog] reset on disconnect failed', error)
      }
    },
  })

  const accept = () => {
    void acceptAnalytics(posthog, { isDev: import.meta.env.DEV })
    linkSupportChat()
    setConsent('granted')
  }

  const decline = () => {
    declineAnalytics(posthog)
    // The reset that clears the visitor id also empties the switches.
    pushFeatureSwitches(knownSwitches(wallet) ?? switches)
    setConsent('denied')
  }

  const content = isHydrated ? (
    // Cast bridges the two posthog-js declaration files (see the type import
    // note above); the runtime object is the real PostHog SDK either way.
    <PostHogProvider client={posthog as unknown as PostHog}>
      {children}
    </PostHogProvider>
  ) : (
    children
  )

  return (
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      {content}
    </AnalyticsConsentContext>
  )
}
