// The SDK comes from the shared client, the one module that imports it: mixing
// the default `posthog-js` build with `module.full.no-external` would bundle
// PostHog twice and run two separate SDK instances. See postHogClient.ts in
// packages/utils for why we use this build.
import posthog from '@ens-apps/utils/postHogClient'
import {
  createTracker,
  type SharedPostHogEvents,
} from '@ens-apps/utils/postHogTrack'

export type PostHogEvents = SharedPostHogEvents & {
  'dnssec_debug:opened': {
    name: string
    source: 'sidebar' | 'import' | 'sync' | 'direct'
  }

  'dnssec_debug:result': {
    name: string
    verdict: string
    failed_step: string | null
  }
}

export const { track, trackWithOptions } = createTracker<PostHogEvents>(posthog)
