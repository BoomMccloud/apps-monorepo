import {
  ANALYTICS_CONSENT_SETTINGS,
  COLLECTION_OFF,
  scrubErrorReport,
} from '@ens-apps/utils/analytics-consent'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import type { FeatureSwitches } from './feature-flags'

/**
 * The SDK's start-up settings. It captures, stores and sends nothing until
 * the visitor accepts (`@ens-apps/utils/analytics-consent`), and it reads the
 * feature switches the server decided for this page instead of asking
 * PostHog, so the browser never asks about a wallet.
 */
export const startupConfig = (
  switches: FeatureSwitches,
): Partial<PostHogConfig> => ({
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-11-30',
  person_profiles: 'identified_only',
  ...ANALYTICS_CONSENT_SETTINGS,
  ...COLLECTION_OFF,
  bootstrap: { featureFlags: switches },
  before_send: scrubErrorReport,
})
