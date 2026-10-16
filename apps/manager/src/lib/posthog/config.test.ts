// @vitest-environment happy-dom
import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  acceptAnalytics,
  COLLECTION_OFF,
  declineAnalytics,
  ERROR_REPORTS_ON,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analytics-consent'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startupConfig } from './config'
import type { FeatureSwitches } from './feature-flags'

/**
 * The real SDK, every request it would send captured before it leaves. Each
 * Accept here is a development build's, recordings off, since the recorder
 * cannot run in happy-dom; the recorder's settings still arrive.
 * happy-dom reports `navigator.webdriver`, and the SDK drops every event from
 * what it takes for a bot, so each test turns that filter off and shows
 * events reaching the stub once the visitor accepts: a test of "nothing is
 * sent" otherwise passes for any settings.
 */

const WALLET = '0x1111111111111111111111111111111111111111'
const SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: true,
  'migration-nft': false,
}
const PROJECT_SETTINGS = {
  sessionRecording: { endpoint: '/s/' },
  surveys: true,
  heatmaps: true,
  capturePerformance: { web_vitals: true },
}

type SentRequest = { readonly url: string; readonly data?: unknown }

const startClient = () => {
  const client = new PostHog()
  const sent: SentRequest[] = []
  vi.spyOn(client, '_send_request').mockImplementation((request) => {
    sent.push({ url: request.url, data: request.data })
    request.callback?.({ statusCode: 200, json: { surveys: [] } })
  })
  client.init('test-key', {
    ...startupConfig(SWITCHES),
    api_host: 'https://posthog.example',
    opt_out_useragent_filter: true,
  })
  return { client, sent }
}

const fetchSettings = vi.fn(async () => Response.json(PROJECT_SETTINGS))

type SentEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

const isEvent = (value: unknown): value is SentEvent =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { event?: unknown }).event === 'string'

// A batch carries a list of events; an event sent at once carries itself.
const eventsIn = (sent: readonly SentRequest[]): SentEvent[] =>
  sent.flatMap((request) =>
    (Array.isArray(request.data) ? request.data : [request.data]).filter(
      isEvent,
    ),
  )

const postHogStorage = () => [
  ...Object.keys(localStorage),
  ...Object.keys(sessionStorage),
  ...document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0]?.trim() ?? '')
    .filter(Boolean),
]

const storedChoice = () =>
  document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('='))
    .find(([name]) => name === ANALYTICS_CONSENT_COOKIE_NAME)?.[1]

const clearCookies = () => {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    // biome-ignore lint/suspicious/noDocumentCookie: Clearing the test document's cookies.
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  }
}

const flush = () => vi.advanceTimersByTimeAsync(4000)

describe('PostHog settings and the analytics choice, on the installed SDK', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    clearCookies()
    fetchSettings.mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends nothing and stores nothing before a choice, and sends once the visitor accepts', async () => {
    const { client, sent } = startClient()
    expect(startAnalyticsChoice(client, { isDev: true, fetchSettings })).toBe(
      'pending',
    )

    client.capture('wallet:connect', { wallet_address: WALLET })
    client.captureException(new Error('before the choice'))
    history.pushState({}, '', '/before-choice')
    document.body.click()
    await flush()

    expect(sent).toEqual([])
    expect(fetchSettings).not.toHaveBeenCalled()
    expect(postHogStorage().filter((key) => /^(__)?ph_/.test(key))).toEqual([])
    expect(storedChoice()).toBeUndefined()

    // The control: the same SDK, accepted, reaches the stub.
    await acceptAnalytics(client, { isDev: true, fetchSettings })
    client.capture('wallet:connect', { wallet_address: WALLET })
    await flush()
    expect(eventsIn(sent).map((event) => event.event)).toEqual(
      expect.arrayContaining(['$pageview', 'wallet:connect']),
    )
    expect(storedChoice()).toBe('1')
  })

  it("reads the server's switches with no request, and takes new answers whole", async () => {
    const { client, sent } = startClient()

    expect(client.isFeatureEnabled('migration', { send_event: false })).toBe(
      true,
    )
    expect(client.isFeatureEnabled('i18n', { send_event: false })).toBe(true)
    expect(
      client.isFeatureEnabled('migration-nft', { send_event: false }),
    ).toBeFalsy()

    client.updateFlags({ ...SWITCHES, migration: false }, undefined, {
      merge: false,
    })
    expect(
      client.isFeatureEnabled('migration', { send_event: false }),
    ).toBeFalsy()

    // Even after Accept and an identify, the browser never asks for switches.
    await acceptAnalytics(client, { isDev: true, fetchSettings })
    client.identify(WALLET, { address: WALLET })
    await flush()
    expect(sent.filter((request) => request.url.includes('/flags'))).toEqual([])
  })

  it('starts collection at once on Accept, and hands the SDK the project settings', async () => {
    const { client, sent } = startClient()

    await acceptAnalytics(client, { isDev: true, fetchSettings })
    await flush()

    expect(fetchSettings).toHaveBeenCalledWith(
      'https://posthog.example/array/test-key/config',
    )
    expect(client.config).toMatchObject({
      capture_pageview: 'history_change',
      autocapture: true,
      capture_exceptions: ERROR_REPORTS_ON,
      disable_surveys: false,
    })
    // Recordings and surveys start from the project's settings.
    expect(
      client.get_property('$session_recording_remote_config'),
    ).toMatchObject({ enabled: true, endpoint: '/s/' })
    expect(sent.some((request) => request.url.includes('/api/surveys'))).toBe(
      true,
    )
  })

  it("puts back the SDK's own defaults for what the pause turned off", () => {
    const { client } = startClient()
    const defaults = new PostHog()
    vi.spyOn(defaults, '_send_request').mockImplementation(() => {})
    defaults.init('defaults-key', {
      api_host: 'https://posthog.example',
      defaults: '2025-11-30',
    })
    void acceptAnalytics(client, { isDev: true, fetchSettings })

    // Error reports are set in code; recordings follow the build.
    const changedOnPurpose = new Set([
      'capture_exceptions',
      'disable_session_recording',
    ])
    for (const key of Object.keys(COLLECTION_OFF)) {
      if (changedOnPurpose.has(key)) continue
      expect(client.config[key as keyof typeof client.config], key).toEqual(
        defaults.config[key as keyof typeof defaults.config],
      )
    }
  })

  it('stops collection on Decline, forgets the wallet and keeps the choice', async () => {
    const { client, sent } = startClient()
    await acceptAnalytics(client, { isDev: true, fetchSettings })
    client.identify(WALLET, { address: WALLET })
    await flush()

    declineAnalytics(client)
    await flush()
    const sentAtDecline = sent.length

    expect(client.get_explicit_consent_status()).toBe('denied')
    expect(storedChoice()).toBe('0')
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(postHogStorage().filter((key) => /^(__)?ph_/.test(key))).toEqual([])
    // The reset empties the switches; the provider pushes them back.
    expect(
      client.isFeatureEnabled('migration', { send_event: false }),
    ).toBeFalsy()

    client.capture('wallet:connect', { wallet_address: WALLET })
    client.captureException(new Error('after decline'))
    await flush()
    expect(sent.length).toBe(sentAtDecline)
  })

  it.each([
    ['granted', '1'],
    ['denied', '0'],
  ] as const)('keeps a %s choice through the reset on a wallet disconnect', async (choice, stored) => {
    const { client } = startClient()
    if (choice === 'granted') {
      await acceptAnalytics(client, { isDev: true, fetchSettings })
    } else {
      declineAnalytics(client)
    }
    client.identify(WALLET, { address: WALLET })

    resetVisitor(client)

    expect(client.get_explicit_consent_status()).toBe(choice)
    expect(storedChoice()).toBe(stored)
    expect(client.get_distinct_id()).not.toBe(WALLET)
  })

  it("forgets this tab's window id when the page starts after a decline made elsewhere", () => {
    // The visitor accepted in this tab earlier, then declined in another one.
    sessionStorage.setItem('ph_test-key_window_id', '"tab-window"')
    sessionStorage.setItem('ph_test-key_primary_window_exists', 'true')
    // biome-ignore lint/suspicious/noDocumentCookie: The choice another app stored.
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=0; path=/`

    const { client } = startClient()
    expect(startAnalyticsChoice(client, { isDev: true, fetchSettings })).toBe(
      'denied',
    )
    expect(postHogStorage().filter((key) => /^(__)?ph_/.test(key))).toEqual([])
  })

  it('leaves an undecided visitor undecided through a reset', () => {
    const { client } = startClient()
    resetVisitor(client)
    expect(client.get_explicit_consent_status()).toBe('pending')
    expect(storedChoice()).toBeUndefined()
  })

  it('cuts addresses and .eth names from error reports', async () => {
    const { client, sent } = startClient()
    await acceptAnalytics(client, { isDev: true, fetchSettings })

    client.captureException(
      new Error(`Call failed for ${WALLET} on vitalik.eth`),
    )
    await flush()

    const reports = eventsIn(sent).filter(
      (event) => event.event === '$exception',
    )
    expect(reports).toHaveLength(1)
    expect(JSON.stringify(reports[0]?.properties.$exception_list)).not.toMatch(
      /0x1111|vitalik\.eth/,
    )
    expect(JSON.stringify(reports[0]?.properties.$exception_list)).toContain(
      'Call failed for [address] on [name]',
    )
  })
})
