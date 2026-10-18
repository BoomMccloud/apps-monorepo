import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import {
  type AnalyticsClient,
  type AnalyticsConsent,
  startAnalyticsChoice,
} from './analyticsConsent'
import { forgetLegacyProjects } from './analyticsLegacyStorage'

/** The part of the PostHog browser SDK that starts it, besides what the choice uses. */
export interface StartableClient extends AnalyticsClient {
  init(token: string, config: Partial<PostHogConfig>): unknown
  readonly __loaded: boolean
}

/**
 * Start the SDK with an app's settings, then apply the visitor's earlier
 * choice: a visitor who accepted, here or in another ENS app, gets what Accept
 * switches on. Returns the choice the page starts with, or `unknown` when the
 * SDK could not start, in which case no banner shows.
 *
 * `legacyProjectKeys` are the PostHog projects the app used before; what the
 * SDK left on the device for them goes first, whatever the visitor chose.
 */
export const startAnalyticsSdk = (
  client: StartableClient,
  token: string,
  config: Partial<PostHogConfig>,
  options: {
    readonly isDev: boolean
    readonly legacyProjectKeys?: readonly string[]
  },
): AnalyticsConsent | 'unknown' => {
  try {
    forgetLegacyProjects(options.legacyProjectKeys ?? [])
    client.init(token, config)
    // The ESM `posthog-js` build keeps the singleton in an internal registry
    // and never attaches it to `window` (unlike the script-tag snippet).
    // Expose it so the browser tests can read the page's state and override
    // flags, and for debugging in the console.
    ;(window as Window & { posthog?: StartableClient }).posthog = client
    if (!client.__loaded) return 'unknown'
    return startAnalyticsChoice(client, { isDev: options.isDev })
  } catch (error) {
    console.warn('[posthog] init failed', error)
    return 'unknown'
  }
}
