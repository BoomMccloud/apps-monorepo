import { analyticsStartupConfig } from '@ens-apps/utils/analyticsConsent'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'

/**
 * The SDK's start-up settings. It captures, stores and sends nothing until
 * the visitor accepts (`@ens-apps/utils/analyticsConsent`). The Explorer
 * reads no feature switch, so it never asks PostHog for one.
 */
export const startupConfig = (): Partial<PostHogConfig> =>
  analyticsStartupConfig({
    apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  })
