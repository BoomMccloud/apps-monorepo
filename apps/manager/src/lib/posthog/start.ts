import { startAnalyticsChoice } from '@ens-apps/utils/analyticsConsent'
import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
// Fully-bundled, no-external build so PostHog never lazy-loads extension
// bundles via runtime <script> tags — our strict CSP blocks those. Same
// approach as portal; see PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'
import { startupConfig } from './config'
import type { FeatureSwitches } from './feature-flags'

/**
 * Start the SDK with the switches the server decided, then apply the
 * visitor's earlier choice: a visitor who accepted, here or in another ENS
 * app, gets what Accept switches on. Returns the choice the page starts with,
 * or `unknown` when the SDK could not start, in which case no banner shows.
 */
export const startPostHog = (
  switches: FeatureSwitches,
): AnalyticsConsentState => {
  try {
    posthog.init(
      import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
      startupConfig(switches),
    )
    // The ESM `posthog-js` build keeps the singleton in an internal registry
    // and never attaches it to `window` (unlike the script-tag snippet).
    // Expose it so e2e can reach `window.posthog.featureFlags` to override
    // flags and read the page's state, and for debugging in the console.
    ;(window as Window & { posthog?: typeof posthog }).posthog = posthog
    if (!posthog.__loaded) return 'unknown'
    return startAnalyticsChoice(posthog, { isDev: import.meta.env.DEV })
  } catch (error) {
    console.warn('[posthog] init failed', error)
    return 'unknown'
  }
}
