// Must come from ./client, the one module that imports the SDK: mixing the
// default `posthog-js` build with `module.full.no-external` would bundle
// PostHog twice and run two separate SDK instances. See client.ts for why we
// use this build.
import type { CaptureOptions } from 'posthog-js/dist/module.full.no-external'
import posthog from './client'

export type PostHogEvents = {
  'wallet:connect': {
    wallet_address: string
    chain_id: number
    wallet_connector: string
  }

  'wallet:disconnect': undefined

  'intercom:booted': undefined

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

export type PostHogEvent = keyof PostHogEvents

export function track<N extends PostHogEvent>(
  name: N,
  ...args: PostHogEvents[N] extends undefined ? [] : [PostHogEvents[N]]
): void {
  posthog.capture(name, args[0])
}

export function trackWithOptions<N extends PostHogEvent>(
  name: N,
  args: PostHogEvents[N],
  options: CaptureOptions,
): void {
  posthog.capture(name, args, options)
}
