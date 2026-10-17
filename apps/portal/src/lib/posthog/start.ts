import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import { startAnalyticsSdk } from '@ens-apps/utils/analyticsStart'
import posthog from './client'
import { startupConfig } from './config'

/**
 * Start the SDK, then apply the visitor's earlier choice
 * (`startAnalyticsSdk`). A deployment without a key (local dev) skips
 * PostHog, and the page then starts with no known choice and shows no banner.
 */
export const startPostHog = (): AnalyticsConsentState => {
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  if (!posthogKey) return 'unknown'
  return startAnalyticsSdk(posthog, posthogKey, startupConfig(), {
    isDev: import.meta.env.DEV,
  })
}
