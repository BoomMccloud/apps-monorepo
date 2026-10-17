import { analyticsStartupConfig } from '@ens-apps/utils/analyticsConsent'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import type { FeatureSwitches } from './feature-flags'

/**
 * The SDK's start-up settings. It captures, stores and sends nothing until
 * the visitor accepts (`@ens-apps/utils/analyticsConsent`), and it reads the
 * feature switches the server decided for this page instead of asking
 * PostHog, so the browser never asks about a wallet.
 */
export const startupConfig = (
  switches: FeatureSwitches,
): Partial<PostHogConfig> =>
  analyticsStartupConfig({
    apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    bootstrapSwitches: switches,
  })
