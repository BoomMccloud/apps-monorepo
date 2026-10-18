import {
  type AnalyticsConsent,
  acceptAnalytics,
  declineAnalytics,
} from '@ens-apps/utils/analyticsConsent'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import { useFollowedChoice } from '@ens-apps/utils/useFollowedChoice'
import { useWalletIdentity } from '@ens-apps/utils/useWalletIdentity'
import { PostHogProvider } from '@posthog/react'
import { rootRouteId, useHydrated, useLoaderData } from '@tanstack/react-router'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import posthog, { reactClient } from './client'
import {
  linkSupportChat,
  relinkSupportChat,
  unlinkSupportChat,
} from './supportChat'
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

  // What the page does about a choice, whether the visitor pressed it here or
  // it was made in another tab or app.
  const applyChoice = (choice: AnalyticsConsent) => {
    setConsent(choice)
    match(choice)
      .with('granted', linkSupportChat)
      .with('denied', () => {
        unlinkSupportChat()
        // The reset that clears the visitor id also empties the switches.
        recordReset()
      })
      .with('pending', unlinkSupportChat)
      .exhaustive()
  }

  usePostHogStart(isHydrated, pageStart.switches, setConsent)
  useFollowedChoice(
    posthog,
    consent !== 'unknown',
    import.meta.env.DEV,
    applyChoice,
  )
  useWalletIdentity(
    posthog,
    consent,
    address ? { address, chainId, connectorName: connector?.name } : null,
    relinkSupportChat,
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
    applyChoice('granted')
  }

  const decline = () => {
    declineAnalytics(posthog)
    applyChoice('denied')
  }

  const content =
    isHydrated && reactClient ? (
      <PostHogProvider client={reactClient}>{children}</PostHogProvider>
    ) : (
      children
    )

  return (
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      {content}
    </AnalyticsConsentContext>
  )
}
