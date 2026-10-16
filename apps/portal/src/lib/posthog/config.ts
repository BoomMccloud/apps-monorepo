import {
  ANALYTICS_CONSENT_SETTINGS,
  COLLECTION_OFF,
  scrubErrorReport,
} from '@ens-apps/utils/analyticsConsent'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'

/**
 * The SDK's start-up settings. It captures, stores and sends nothing until
 * the visitor accepts (`@ens-apps/utils/analyticsConsent`). The Explorer
 * reads no feature switch, so it never asks PostHog for one.
 */
export const startupConfig = (): Partial<PostHogConfig> => ({
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-11-30',
  person_profiles: 'identified_only',
  ...ANALYTICS_CONSENT_SETTINGS,
  ...COLLECTION_OFF,
  before_send: scrubErrorReport,
})
