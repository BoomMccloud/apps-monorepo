import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import { startAnalyticsSdk } from '@ens-apps/utils/analyticsStart'
import posthog from './client'
import { startupConfig } from './config'
import type { FeatureSwitches } from './feature-flags'

/**
 * Start the SDK with the switches the server decided, then apply the
 * visitor's earlier choice (`startAnalyticsSdk`). Returns the choice the page
 * starts with, or `unknown` when the SDK could not start, in which case no
 * banner shows.
 */
export const startPostHog = (
  switches: FeatureSwitches,
): AnalyticsConsentState =>
  startAnalyticsSdk(
    posthog,
    import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    startupConfig(switches),
    { isDev: import.meta.env.DEV },
  )
