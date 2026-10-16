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
import { linkSupportChat } from './supportChat'
import { useFeatureSwitchSync } from './useFeatureSwitchSync'
import { useIsConnectionSettled } from './useIsConnectionSettled'
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
  const pageStart = useLoaderData({ from: rootRouteId })
  const { address, chainId, connector } = useConnection()
  const isConnectionSettled = useIsConnectionSettled()
  const [consent, setConsent] = useState<AnalyticsConsentState>('unknown')
  // Each reset empties the SDK's switches; the sync hook writes them again.
  const [resetCount, setResetCount] = useState(0)
  const recordReset = () => setResetCount((count) => count + 1)

  usePostHogStart(isHydrated, pageStart.switches, setConsent)
  useFollowedChoice(
    posthog,
    consent !== 'unknown',
    import.meta.env.DEV,
    (followed) => {
      setConsent(followed)
      if (followed === 'granted') linkSupportChat()
      // The Decline followed here reset the SDK.
      if (followed === 'denied') recordReset()
    },
  )
  useWalletIdentity(
    posthog,
    consent,
    address ? { address, chainId, connectorName: connector?.name } : null,
  )
  useFeatureSwitchSync({
    wallet: address ?? null,
    isConnectionSettled,
    pageStart,
    resetCount,
  })

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
      // The reset empties the SDK's switches; the sync hook writes the answers
      // for a visitor with no wallet, or every switch off until it has them.
      try {
        track('wallet:disconnect')
        resetVisitor(posthog)
        recordReset()
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
    recordReset()
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
