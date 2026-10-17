import {
  acceptAnalytics,
  declineAnalytics,
} from '@ens-apps/utils/analyticsConsent'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
  useFollowedChoice,
  useWalletIdentity,
} from '@ens-apps/utils/analyticsConsentContext'
import { PostHogProvider } from '@posthog/react'
import { rootRouteId, useHydrated, useLoaderData } from '@tanstack/react-router'
// @posthog/react types its `client` prop with the `PostHog` type from the
// default `posthog-js` build, which is a *nominally* distinct declaration from
// the no-external build's `PostHog`. Import that type to cast at the provider
// boundary below.
import type { PostHog } from 'posthog-js'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useState } from 'react'
import { useConnection } from 'wagmi'
import { linkSupportChat } from './supportChat'
import { useFeatureSwitchSync } from './useFeatureSwitchSync'
import { useIsConnectionSettled } from './useIsConnectionSettled'
import { usePostHogStart } from './usePostHogStart'
import { useWalletAnalytics } from './useWalletAnalytics'

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

  useWalletAnalytics(recordReset)

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
