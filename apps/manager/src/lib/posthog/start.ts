import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import { LEGACY_POSTHOG_PROJECT_KEYS } from '@ens-apps/utils/analyticsLegacyStorage'
import { startAnalyticsSdk } from '@ens-apps/utils/analyticsStart'
import posthog from '@ens-apps/utils/postHogClient'
import { startupConfig } from './config'
import type { FeatureSwitches } from './feature-flags'

/**
 * Start the SDK with the switches the server decided, then apply the
 * visitor's earlier choice (`startAnalyticsSdk`). Returns the choice the page
 * starts with, or `unknown` when the SDK could not start, in which case no
 * banner shows. What the SDK left on the device for the Explorer's earlier
 * project goes first, as in the Explorer, since the two apps share a parent
 * domain.
 */
export const startPostHog = (
  switches: FeatureSwitches,
): AnalyticsConsentState =>
  startAnalyticsSdk(
    posthog,
    import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    startupConfig(switches),
    {
      isDev: import.meta.env.DEV,
      legacyProjectKeys: LEGACY_POSTHOG_PROJECT_KEYS,
    },
  )
