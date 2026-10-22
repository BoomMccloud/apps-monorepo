import {
  type AnalyticsConsent,
  acceptAnalytics,
  declineAnalytics,
} from '@ens-apps/utils/analyticsConsent'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import posthog, { reactClient } from '@ens-apps/utils/postHogClient'
import { useFollowedChoice } from '@ens-apps/utils/useFollowedChoice'
import { useWalletIdentity } from '@ens-apps/utils/useWalletIdentity'
import { PostHogProvider } from '@posthog/react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { useConnection } from 'wagmi'
import {
  linkSupportChat,
  relinkSupportChat,
  unlinkSupportChat,
} from './supportChat'
import { usePostHogStart } from './usePostHogStart'
import { useWalletAnalytics } from './useWalletAnalytics'

/**
 * PostHog for the Explorer: analytics only after the visitor accepts, and the
 * visitor's choice for the banner and the notice. The Explorer reads no
 * feature switch, so nothing about a visitor reaches PostHog before Accept.
 */
export const PHProvider = ({
  children,
}: {
  readonly children: React.ReactNode
}): React.ReactNode => {
  const { address, chainId, connector } = useConnection()
  const [consent, setConsent] = useState<AnalyticsConsentState>('unknown')

  // What the page does about a choice, whether the visitor pressed it here or
  // it was made in another tab or app.
  const applyChoice = (choice: AnalyticsConsent) => {
    setConsent(choice)
    match(choice)
      .with('granted', linkSupportChat)
      .with('denied', 'pending', unlinkSupportChat)
      .exhaustive()
  }

  usePostHogStart(setConsent)
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

  useWalletAnalytics()

  const accept = () => {
    void acceptAnalytics(posthog, { isDev: import.meta.env.DEV })
    applyChoice('granted')
  }

  const decline = () => {
    declineAnalytics(posthog)
    applyChoice('denied')
  }

  const content = reactClient ? (
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
