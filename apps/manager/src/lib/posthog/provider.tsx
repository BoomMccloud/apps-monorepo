import { AnalyticsConsentContext } from '@ens-apps/utils/analyticsConsentContext'
import { reactClient } from '@ens-apps/utils/postHogClient'
import { useConsentChoice } from '@ens-apps/utils/useConsentChoice'
import { PostHogProvider } from '@posthog/react'
import { rootRouteId, useHydrated, useLoaderData } from '@tanstack/react-router'
import { useConnection, useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { useFailedRunTelemetry } from './failedRunTelemetry'
import { useFeatureSwitchSync } from './useFeatureSwitchSync'
import { useIsConnectionSettled } from './useIsConnectionSettled'

const wagmi = { useConnection, useConnectionEffect }

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
  const { address } = useConnection()
  const isConnectionSettled = useIsConnectionSettled()

  const choice = useConsentChoice({
    wagmi,
    intercomAppId: INTERCOM_APP_ID,
    projectKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    isDev: import.meta.env.DEV,
    isReady: isHydrated,
    bootstrapSwitches: pageStart.switches,
    // Each reset empties the SDK's switches; the sync hook, which has to come
    // after the hook that starts the SDK, writes them again.
    onVisitorReset: () => recordReset(),
  })
  const recordReset = useFeatureSwitchSync({
    wallet: address ?? null,
    isConnectionSettled,
    pageStart,
  })
  useFailedRunTelemetry(isHydrated)

  const content =
    isHydrated && reactClient ? (
      <PostHogProvider client={reactClient}>{children}</PostHogProvider>
    ) : (
      children
    )

  return (
    <AnalyticsConsentContext value={choice}>{content}</AnalyticsConsentContext>
  )
}
