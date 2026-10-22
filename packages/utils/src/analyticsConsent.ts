/**
 * The visitor's analytics choice, shared by the ENS apps.
 *
 * PostHog's own consent setting keeps the choice in a cookie on the apps'
 * shared parent domain, so a choice made in one app applies in all of them,
 * and no code of ours reads or writes that cookie. This module holds what both
 * apps do with the choice: the settings for each state of it, the steps that
 * change it, and following a change made in another tab or app. What is sent
 * is held back until the visitor accepts by `analyticsSendGuard`, and what an
 * error report may carry is cut by `analyticsErrorReports`. The hooks that put
 * the choice to use (`useConsentChoice`, `useAnalyticsBanner` and
 * `useAnalyticsNotice`) are in this package as well; each app keeps only the
 * markup of its banner and notice, and the settings it passes in.
 */
import { fromPromise, ok } from 'neverthrow'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import type { Address } from 'viem'
import { scrubErrorReport } from './analyticsErrorReports'
import { endConsentPeriod, guardPostHogSends } from './analyticsSendGuard'
import { isRecord } from './isRecord'
import { ResultFn, TaggedError } from './neverthrow'

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
  readonly capture_heatmaps: boolean
}

/**
 * Collection before Accept and after Decline: everything off.
 *
 * Page views stay set to follow history changes: the SDK starts watching
 * them only at start-up, never on a later change of settings, and it sends
 * nothing it sees until the visitor accepts.
 *
 * Dead clicks and performance timings are left unset: each follows the
 * project's settings, which load only after Accept, so before Accept none of
 * them can start, and unset is the only value that hands them back to the
 * project's settings afterwards. Heatmaps are set off instead: they buffer
 * every click without asking about the choice, and only an explicit off makes
 * the SDK drop that buffer and stop listening, so a Decline would otherwise
 * leave them collecting for a later Accept to send. They start again from the
 * project's settings once Accept has loaded them (`loadProjectSettings`).
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
  capture_heatmaps: false,
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
 * development build, plus error reports, which the code switches on itself,
 * so the project's own setting for them does not apply.
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
  // Off until the project's settings arrive and say whether they are on.
  capture_heatmaps: false,
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
  reset(shouldResetDeviceId?: boolean): void
  /**
   * Sends what is still queued, through `sendBeacon`, and empties the queue
   * of requests waiting to be tried again.
   */
  shutdown(): Promise<void>
  set_config(config: Readonly<Partial<CollectionSettings>>): void
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

/** The request failed, the host refused it, or its answer cannot be read. */
class ProjectSettingsNotLoaded extends TaggedError('ProjectSettingsNotLoaded')<{
  readonly message: string
  readonly cause: unknown
}> {}

const requestProjectSettings = ResultFn(async function* (
  client: AnalyticsClient,
) {
  const response = yield* fromPromise(
    fetch(projectSettingsUrl(client)),
    (cause) =>
      new ProjectSettingsNotLoaded({ message: 'the request failed', cause }),
  )
  if (!response.ok) {
    yield* new ProjectSettingsNotLoaded({
      message: `the host answered ${response.status}`,
      cause: undefined,
    })
  }
  const settings = yield* fromPromise(
    response.json(),
    (cause) =>
      new ProjectSettingsNotLoaded({
        message: 'the answer could not be read',
        cause,
      }),
  )
  return ok<unknown>(settings)
})

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
  const loaded = await requestProjectSettings(client)
  if (loaded.isErr()) {
    console.warn('[posthog] project settings failed to load', loaded.error)
  }
  if (client.get_explicit_consent_status() !== 'granted') return
  client._onRemoteConfig(
    loaded.isOk() && isRecord(loaded.value)
      ? { ok: true, config: loaded.value }
      : { ok: false },
  )
  // Heatmaps follow the project: on only when its settings say so.
  client.set_config({
    capture_heatmaps:
      loaded.isOk() && isRecord(loaded.value) && Boolean(loaded.value.heatmaps),
  })
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
 * The element the SDK mounts each displayed survey in has a class of this
 * form: `PostHogSurvey-<survey id>`.
 */
const SURVEY_HOST_SELECTOR = '[class*="PostHogSurvey-"]'

/**
 * A survey on screen at a Decline stays interactive, and its answers are kept
 * in storage as the visitor goes through its questions, so it goes off the
 * page. The SDK's reset, which follows, clears what it kept. A survey taken
 * off holds the SDK's focus until the page loads again, so none shows after a
 * Decline and an Accept without a reload.
 */
const dismissSurveys = (): void => {
  for (const host of globalThis.document?.querySelectorAll(
    SURVEY_HOST_SELECTOR,
  ) ?? []) {
    host.remove()
  }
}

/**
 * Decline: collection stops at once, and nothing captured before it is sent
 * after it, since the send guard holds back every request while the choice is
 * not Accept. The choice goes first, so that what stopping a part of the
 * collection would still send, such as the recorder's last chunk, is held
 * back too. What is waiting to be tried again is let go the same way, through
 * the SDK's shutdown, and the guard ends the period, so that a request in
 * flight that fails later is not tried again either: a visitor who accepts
 * again at once does not send what was captured before. The SDK keeps the
 * visitor id in memory after an opt-out, and only a reset clears it; the
 * reset forgets the device too, so a later Accept does not tie new events to
 * old ones, and it erases the choice, so the choice is put back.
 */
export const declineAnalytics = (client: AnalyticsClient): void => {
  guardPostHogSends(client)
  endConsentPeriod()
  appliedChoice.set(client, 'denied')
  client.opt_out_capturing()
  client.set_config(collectionOff)
  // The SDK stops its product tours only when the project's settings say that
  // they are off, so it is handed settings that say so.
  client._onRemoteConfig({ ok: true, config: { productTours: false } })
  dismissSurveys()
  void client.shutdown()
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
