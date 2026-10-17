/**
 * The visitor's analytics choice, shared by the ENS apps.
 *
 * PostHog's own consent setting keeps the choice in a cookie on the apps'
 * shared parent domain, so a choice made in one app applies in all of them,
 * and no code of ours reads or writes that cookie. This module holds what both
 * apps do with the choice: the settings for each state of it, the steps that
 * change it, following a change made in another tab or app, and the scrubbing
 * of error reports. What is sent is held back until the visitor accepts by
 * `analyticsSendGuard`. Each app keeps its own banner, notice and wiring.
 */
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import type { Address } from 'viem'
import { guardPostHogSends } from './analyticsSendGuard'
import { isRecord } from './isRecord'

/** The cookie the choice lives in: `1` after Accept, `0` after Decline. */
export const ANALYTICS_CONSENT_COOKIE_NAME = 'ens.analytics.consent'

/** The choice as PostHog reports it; `pending` until the visitor chooses. */
export type AnalyticsConsent = 'granted' | 'denied' | 'pending'

/**
 * Start-up settings. Nothing is captured or stored until Accept, the choice
 * lives in the cookie the apps share, and the browser never asks PostHog for
 * feature switches or for the project's settings on its own: the Manager's
 * server decides the switches, and the project's settings are loaded after
 * Accept (`acceptAnalytics`).
 */
const analyticsConsentSettings = {
  opt_out_capturing_by_default: true,
  opt_out_persistence_by_default: true,
  consent_persistence_name: ANALYTICS_CONSENT_COOKIE_NAME,
  opt_out_capturing_persistence_type: 'cookie',
  cross_subdomain_cookie: true,
  // When the shared cookie and local storage disagree, the cookie wins, so a
  // visitor id reset in one app reaches the others.
  __preview_cookie_wins_on_conflict: true,
  advanced_disable_flags: true,
  // Each event is sent as it is captured, at one request per event, so none
  // waits in a batch to leave after a visitor who declined accepts again.
  // What is sent after a Decline is held back by `analyticsSendGuard`.
  request_batching: false,
} as const

/** The collection settings the choice switches on and off. */
type CollectionSettings = {
  readonly capture_pageview: boolean | 'history_change'
  readonly capture_pageleave: boolean | 'if_capture_pageview'
  readonly autocapture: boolean
  readonly capture_exceptions:
    | boolean
    | {
        readonly capture_unhandled_errors: boolean
        readonly capture_unhandled_rejections: boolean
        readonly capture_console_errors: boolean
      }
  readonly save_campaign_params: boolean
  readonly save_referrer: boolean
  readonly disable_surveys: boolean
  readonly disable_product_tours: boolean
  readonly disable_web_experiments: boolean
  readonly disable_conversations: boolean
  readonly disable_session_recording: boolean
}

/**
 * Collection before Accept and after Decline: everything off.
 *
 * Page views stay set to follow history changes: the SDK starts watching
 * them only at start-up, never on a later change of settings, and it sends
 * nothing it sees until the visitor accepts.
 *
 * Heatmaps, dead clicks and performance timings are left unset: each follows
 * the project's settings, which load only after Accept, so before Accept none
 * of them can start, and unset is the only value that hands them back to the
 * project's settings afterwards.
 */
export const collectionOff: CollectionSettings = {
  capture_pageview: 'history_change',
  capture_pageleave: false,
  autocapture: false,
  capture_exceptions: false,
  save_campaign_params: false,
  save_referrer: false,
  disable_surveys: true,
  disable_product_tours: true,
  disable_web_experiments: true,
  disable_conversations: true,
  disable_session_recording: true,
}

/** Error reports: uncaught errors and unhandled rejections, never the console. */
export const errorReportsOn = {
  capture_unhandled_errors: true,
  capture_unhandled_rejections: true,
  capture_console_errors: false,
} as const

/**
 * Collection after Accept: what ran before the launch pause, the SDK's
 * defaults apart from page views on history changes and no recordings on a
 * development build, plus error reports, which are set here because the
 * project's own setting for them is never loaded.
 */
export const collectionOn = ({
  isDev,
}: {
  readonly isDev: boolean
}): CollectionSettings => ({
  capture_pageview: 'history_change',
  capture_pageleave: 'if_capture_pageview',
  autocapture: true,
  capture_exceptions: errorReportsOn,
  save_campaign_params: true,
  save_referrer: true,
  disable_surveys: false,
  disable_product_tours: false,
  disable_web_experiments: true,
  disable_conversations: false,
  disable_session_recording: isDev,
})

/**
 * The SDK's start-up settings for every ENS app. Nothing is captured, stored or
 * sent until the visitor accepts, the choice lives in the cookie the apps
 * share, and the SDK never asks PostHog for feature switches: an app that
 * reads switches passes the ones its server decided, which the SDK takes as
 * they are.
 */
export const analyticsStartupConfig = ({
  apiHost,
  bootstrapSwitches,
}: {
  readonly apiHost: string | undefined
  readonly bootstrapSwitches?: Readonly<Record<string, boolean>>
}): Partial<PostHogConfig> => ({
  api_host: apiHost,
  defaults: '2025-11-30',
  person_profiles: 'identified_only',
  ...analyticsConsentSettings,
  ...collectionOff,
  ...(bootstrapSwitches
    ? { bootstrap: { featureFlags: bootstrapSwitches } }
    : {}),
  before_send: scrubErrorReport,
})

/** The part of the PostHog browser SDK the choice uses. */
export interface AnalyticsClient {
  readonly config: {
    readonly token: string
    readonly api_host: string
    readonly persistence_name?: string
  }
  get_explicit_consent_status(): AnalyticsConsent
  get_distinct_id(): string
  identify(
    distinctId: string,
    userPropertiesToSet: Readonly<Record<string, unknown>>,
    userPropertiesToSetOnce: Readonly<Record<string, unknown>>,
  ): void
  register(properties: Readonly<Record<string, unknown>>): void
  opt_in_capturing(options: { readonly captureEventName: false }): void
  opt_out_capturing(): void
  /** With `true`, the device id is forgotten along with the visitor id. */
  reset(resetDeviceId?: boolean): void
  set_config(config: CollectionSettings): void
  /**
   * The SDK's own hand-off of the project's settings to its recordings,
   * surveys, heatmaps and the rest. It has no public way to load them once
   * `advanced_disable_flags` is set at start-up, and that setting is what
   * keeps the browser from asking PostHog for feature switches.
   */
  _onRemoteConfig(
    result:
      | { readonly ok: true; readonly config: object }
      | { readonly ok: false },
  ): void
}

/**
 * The class PostHog neither captures nor records anything inside of. The
 * notice's switch has it: the SDK sees the press that declines before the
 * choice takes effect, so without it that click would leave as an event.
 */
export const NOT_CAPTURED_CLASS = 'ph-no-capture'

/** Where the SDK itself reads the project's settings from. */
const projectSettingsUrl = (client: AnalyticsClient): string =>
  `${client.config.api_host.replace(/\/+$/, '')}/array/${client.config.token}/config`

/**
 * Load the project's settings and hand them to the SDK, as it would at
 * start-up had the visitor already accepted. Settings that arrive after the
 * visitor has declined are dropped.
 *
 * A plain `fetch`, not a query: no component reads the answer. This replays
 * the request the SDK makes itself when it starts with consent, so a cache,
 * a retry or a refetch on focus would be behaviour the SDK does not have.
 */
const loadProjectSettings = async (client: AnalyticsClient): Promise<void> => {
  const settings = await fetch(projectSettingsUrl(client))
    .then((response) => {
      if (!response.ok) throw new Error(`the host answered ${response.status}`)
      return response.json()
    })
    .catch((cause: unknown) => {
      console.warn('[posthog] project settings failed to load', cause)
      return undefined
    })
  if (client.get_explicit_consent_status() !== 'granted') return
  client._onRemoteConfig(
    isRecord(settings) ? { ok: true, config: settings } : { ok: false },
  )
}

/** The options of Accept, of start-up and of following the stored choice. */
type ChoiceOptions = {
  readonly isDev: boolean
}

// The choice each client's page last applied, so that following the stored
// choice applies only a change made elsewhere. This module's own record,
// read by nothing else (no-mutation).
const appliedChoice = new WeakMap<AnalyticsClient, AnalyticsConsent>()

/** Accept: collection starts at once, then the project's settings load. */
export const acceptAnalytics = (
  client: AnalyticsClient,
  options: ChoiceOptions,
): Promise<void> => {
  guardPostHogSends(client)
  appliedChoice.set(client, 'granted')
  client.set_config(collectionOn(options))
  // The SDK's own `$opt_in` event is not one the apps sent before the pause.
  client.opt_in_capturing({ captureEventName: false })
  return loadProjectSettings(client)
}

/**
 * The SDK keeps the tab's window id in session storage, outside the storage
 * its opt-out clears, and leaves it there after a visitor declines.
 */
const forgetTabSession = (client: AnalyticsClient): void => {
  const name = client.config.persistence_name || client.config.token
  try {
    for (const entry of ['window_id', 'primary_window_exists']) {
      globalThis.sessionStorage?.removeItem(`ph_${name}_${entry}`)
    }
  } catch {
    // Storage the browser refuses to open holds nothing to forget.
  }
}

/**
 * Decline: collection stops at once, and nothing captured before it is sent
 * after it, since the send guard holds back every request while the choice is
 * not Accept. The choice goes first, so that what stopping a part of the
 * collection would still send, such as the recorder's last chunk, is held
 * back too. The SDK keeps the visitor id in memory after an opt-out, and
 * only a reset clears it; the reset forgets the device too, so a later Accept
 * does not tie new events to old ones, and it erases the choice, so the
 * choice is put back.
 */
export const declineAnalytics = (client: AnalyticsClient): void => {
  guardPostHogSends(client)
  appliedChoice.set(client, 'denied')
  client.opt_out_capturing()
  client.set_config(collectionOff)
  client.reset(true)
  client.opt_out_capturing()
  forgetTabSession(client)
}

const RESTORE_CONSENT: Readonly<
  Record<AnalyticsConsent, (client: AnalyticsClient) => void>
> = {
  granted: (client) => client.opt_in_capturing({ captureEventName: false }),
  denied: (client) => client.opt_out_capturing(),
  pending: () => {},
}

/**
 * Forget the visitor (on a wallet disconnect) and keep their choice: the
 * SDK's reset erases the stored choice along with the visitor id. The device
 * id stays, as it did before the pause: it names the browser, not the person,
 * and only Decline, which withdraws the choice, forgets it too.
 */
export const resetVisitor = (client: AnalyticsClient): void => {
  const consent = client.get_explicit_consent_status()
  client.reset()
  RESTORE_CONSENT[consent](client)
}

/**
 * At start-up, a visitor who accepted earlier, here or in another ENS app,
 * gets what Accept switches on. Returns the choice the page starts with.
 */
export const startAnalyticsChoice = (
  client: AnalyticsClient,
  options: ChoiceOptions,
): AnalyticsConsent => {
  guardPostHogSends(client)
  const consent = client.get_explicit_consent_status()
  appliedChoice.set(client, consent)
  if (consent === 'granted') {
    void acceptAnalytics(client, options)
  } else {
    // A decline made in another tab or app leaves this tab's window id.
    forgetTabSession(client)
  }
  return consent
}

/** How often an open page checks for a choice made in another tab or app. */
export const STORED_CHOICE_CHECK_MS = 3_000

/** A choice another tab or app applied, applied here the same way. */
const FOLLOW_STORED_CHOICE: Readonly<
  Record<
    AnalyticsConsent,
    (client: AnalyticsClient, options: ChoiceOptions) => void
  >
> = {
  granted: (client, options) => {
    void acceptAnalytics(client, options)
  },
  denied: (client) => declineAnalytics(client),
  // The choice was removed elsewhere: nothing is collected until one is made,
  // and the send guard holds back what is still waiting.
  pending: (client) => {
    appliedChoice.set(client, 'pending')
    client.set_config(collectionOff)
    forgetTabSession(client)
  },
}

/**
 * Follow a choice made in another tab or another ENS app. The choice lives in
 * the shared cookie and PostHog tells nobody when it changes, so the page
 * looks at it whenever it comes back into view and every few seconds while
 * it stays open, and applies a change made elsewhere as a press here would;
 * without it, a tab left open after a Decline elsewhere would go on storing
 * the visitor id. Returns the stop.
 */
export const followStoredChoice = (
  client: AnalyticsClient,
  options: ChoiceOptions & {
    readonly onChange: (consent: AnalyticsConsent) => void
  },
): (() => void) => {
  const check = (): void => {
    const stored = client.get_explicit_consent_status()
    if (stored === (appliedChoice.get(client) ?? 'pending')) return
    FOLLOW_STORED_CHOICE[stored](client, options)
    options.onChange(stored)
  }
  const checkWhenShown = (): void => {
    if (globalThis.document?.visibilityState === 'visible') check()
  }
  const timer = setInterval(check, STORED_CHOICE_CHECK_MS)
  globalThis.addEventListener?.('focus', check)
  globalThis.addEventListener?.('pageshow', check)
  globalThis.document?.addEventListener('visibilitychange', checkWhenShown)
  return () => {
    clearInterval(timer)
    globalThis.removeEventListener?.('focus', check)
    globalThis.removeEventListener?.('pageshow', check)
    globalThis.document?.removeEventListener('visibilitychange', checkWhenShown)
  }
}

export type ConnectedWallet = {
  readonly address: Address
  readonly chainId: number | undefined
  readonly connectorName: string | undefined
}

/**
 * After Accept, the visitor is their wallet: their visitor id becomes the
 * address and their events carry the wallet's details. Does nothing before
 * Accept, when the SDK would hold the address in memory only to drop it.
 */
export const identifyWallet = (
  client: AnalyticsClient,
  wallet: ConnectedWallet,
): void => {
  if (client.get_explicit_consent_status() !== 'granted') return
  if (client.get_distinct_id() !== wallet.address) {
    client.identify(
      wallet.address,
      { address: wallet.address },
      { initial_address: wallet.address },
    )
  }
  client.register({
    wallet_address: wallet.address,
    chain_id: wallet.chainId,
    wallet_connector: wallet.connectorName,
  })
}

// ---------------------------------------------------------------------------
// Error reports
// ---------------------------------------------------------------------------

// `0x` and 40 or more hex digits, of any length: an address, a hash, or a failed
// call's whole data, which holds addresses inside it.
const ADDRESS_PATTERN = /0x[0-9a-fA-F]{40,}/g
// A run of anything but spaces, quotes and brackets that ends in `.eth`, no
// longer than a name can be (253 characters), so a long run with no `.eth`,
// such as a call's whole data, is not searched again from every character.
const ETH_NAME_PATTERN = /[^\s"'`<>()[\]{},;:]{1,253}\.eth\b/giu
export const ERROR_MESSAGE_MAX_LENGTH = 200
// More than enough for any 200 characters left after scrubbing, since each
// address or name cut shrinks the text, and short enough to scrub at once on
// the page's thread.
const SCRUBBED_INPUT_MAX_LENGTH = 10_000

// The hex digits of an address the cut went through: with fewer than 40 left
// they are no address to the pattern above, so they are cut with the rest.
const CUT_ADDRESS_PATTERN = /0x[0-9a-fA-F]*$/u

const cutToScrubbedInput = (message: string): string =>
  message.length > SCRUBBED_INPUT_MAX_LENGTH
    ? message
        .slice(0, SCRUBBED_INPUT_MAX_LENGTH)
        .replace(CUT_ADDRESS_PATTERN, '[address]')
    : message

/**
 * Cut addresses and `.eth` names out of an error message, then cut it to
 * length. A name that does not end in `.eth` cannot be told from other text,
 * so other names may remain.
 */
export const scrubErrorMessage = (message: string): string =>
  cutToScrubbedInput(message)
    .replace(ADDRESS_PATTERN, '[address]')
    .replace(ETH_NAME_PATTERN, '[name]')
    .slice(0, ERROR_MESSAGE_MAX_LENGTH)

const scrubExceptionEntry = (entry: unknown): unknown =>
  isRecord(entry) && typeof entry.value === 'string'
    ? { ...entry, value: scrubErrorMessage(entry.value) }
    : entry

/**
 * The SDK's `before_send`: an error report's messages lose their addresses
 * and `.eth` names; every other event passes through unchanged.
 */
export const scrubErrorReport = <
  TEvent extends {
    readonly event: string
    readonly properties: Readonly<Record<string, unknown>>
  },
>(
  event: TEvent | null,
): TEvent | null => {
  if (event?.event !== '$exception') return event
  const list = event.properties.$exception_list
  if (!Array.isArray(list)) return event
  return {
    ...event,
    properties: {
      ...event.properties,
      $exception_list: list.map(scrubExceptionEntry),
    },
  }
}
