import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import { startAnalyticsSdk } from '@ens-apps/utils/analyticsStart'
import posthog from './client'
import { startupConfig } from './config'

/**
 * The PostHog project the Explorer used before it joined the Manager's (the
 * ticket's one-project decision). A returning visitor's browser still holds
 * that project's visitor id, which is a wallet address once they connected
 * one; the SDK clears only the current project's, so the start clears these.
 */
export const LEGACY_POSTHOG_PROJECT_KEYS = [
  'phc_1Md3nkBli5dtiu6CE9ERfaCYye84aE8PUhQNBjNdzCh',
] as const

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
    legacyProjectKeys: LEGACY_POSTHOG_PROJECT_KEYS,
  })
}
