import { startAnalyticsChoice } from '@ens-apps/utils/analyticsConsent'
import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import posthog from './client'
import { startupConfig } from './config'

/**
 * Start the SDK, then apply the visitor's earlier choice: a visitor who
 * accepted, here or in another ENS app, gets what Accept switches on. A
 * deployment without a key (local dev) skips PostHog, and the page then
 * starts with no known choice and shows no banner.
 */
export const startPostHog = (): AnalyticsConsentState => {
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  if (!posthogKey) return 'unknown'
  try {
    posthog.init(posthogKey, startupConfig())
    // The ESM build never attaches the singleton to `window`; expose it, as
    // the Manager does, so the browser tests can read the page's state and
    // for debugging in the console.
    ;(window as Window & { posthog?: typeof posthog }).posthog = posthog
    if (!posthog.__loaded) return 'unknown'
    return startAnalyticsChoice(posthog, { isDev: import.meta.env.DEV })
  } catch (error) {
    console.warn('[posthog] init failed', error)
    return 'unknown'
  }
}
