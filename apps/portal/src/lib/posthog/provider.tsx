import { AnalyticsConsentContext } from '@ens-apps/utils/analyticsConsentContext'
import { reactClient } from '@ens-apps/utils/postHogClient'
import { useConsentChoice } from '@ens-apps/utils/useConsentChoice'
import { PostHogProvider } from '@posthog/react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'

const wagmi = { useConnection, useConnectionEffect }

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
  const choice = useConsentChoice({
    wagmi,
    intercomAppId: INTERCOM_APP_ID,
    projectKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    isDev: import.meta.env.DEV,
  })

  const content = reactClient ? (
    <PostHogProvider client={reactClient}>{children}</PostHogProvider>
  ) : (
    children
  )

  return (
    <AnalyticsConsentContext value={choice}>{content}</AnalyticsConsentContext>
  )
}
