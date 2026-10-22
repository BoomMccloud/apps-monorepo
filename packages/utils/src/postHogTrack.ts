import type { CaptureOptions } from 'posthog-js/dist/module.full.no-external'

/** The part of PostHog's SDK that records an event. */
export interface CapturingClient {
  capture(
    name: string,
    properties?: Readonly<Record<string, unknown>> | null,
    options?: CaptureOptions,
  ): unknown
}

/** The events that every ENS app records the same way. */
export type SharedPostHogEvents = {
  'wallet:connect': {
    wallet_address: string
    chain_id: number
    wallet_connector: string
  }

  'wallet:disconnect': undefined

  'intercom:booted': undefined
}

/**
 * The helpers an app records its events with, typed by its own list of events:
 * `PostHogEvents` maps each event's name to its properties, or to `undefined`
 * for an event with none.
 */
export const createTracker = <
  Events extends {
    readonly [Name in keyof Events]:
      | Readonly<Record<string, unknown>>
      | undefined
  },
>(
  client: CapturingClient,
) => ({
  track: <Name extends keyof Events & string>(
    name: Name,
    ...args: Events[Name] extends undefined ? [] : [Events[Name]]
  ): void => {
    client.capture(name, args[0])
  },

  trackWithOptions: <Name extends keyof Events & string>(
    name: Name,
    properties: Events[Name],
    options: CaptureOptions,
  ): void => {
    client.capture(name, properties, options)
  },
})
