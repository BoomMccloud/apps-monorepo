// @vitest-environment happy-dom
import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  acceptAnalytics,
  declineAnalytics,
  identifyWallet,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analyticsConsent'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startupConfig } from './config'

/**
 * The real SDK, every request it would send captured before it leaves.
 * happy-dom reports `navigator.webdriver`, and the SDK drops every event from
 * what it takes for a bot, so each test turns that filter off and shows
 * events reaching the stub once the visitor accepts. Each Accept is a
 * development build's, recordings off, since the recorder cannot run in
 * happy-dom; the recorder's settings still arrive.
 */

const WALLET = '0x1111111111111111111111111111111111111111'
const PROJECT_SETTINGS = {
  sessionRecording: { endpoint: '/s/' },
  surveys: true,
}

type SentRequest = { readonly url: string; readonly data?: unknown }
type SentEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

const startClient = () => {
  const client = new PostHog()
  const sent: SentRequest[] = []
  vi.spyOn(client, '_send_request').mockImplementation((request) => {
    sent.push({ url: request.url, data: request.data })
    request.callback?.({ statusCode: 200, json: { surveys: [] } })
  })
  client.init('test-key', {
    ...startupConfig(),
    api_host: 'https://posthog.example',
    opt_out_useragent_filter: true,
  })
  return { client, sent }
}

const fetchSettings = vi.fn(async () => Response.json(PROJECT_SETTINGS))

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

const postHogStorage = () =>
  [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
    ...document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0]?.trim() ?? ''),
  ].filter((key) => /^(__)?ph_/.test(key))

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

  it('sends nothing and stores nothing before a choice, not even about a connected wallet', async () => {
    const { client, sent } = startClient()
    expect(startAnalyticsChoice(client, { isDev: true, fetchSettings })).toBe(
      'pending',
    )

    // The identify the Explorer made on connect, for switch targeting, is gone.
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    client.capture('wallet:connect', { wallet_address: WALLET })
    client.captureException(new Error('before the choice'))
    history.pushState({}, '', '/before-choice')
    await flush()

    expect(sent).toEqual([])
    expect(fetchSettings).not.toHaveBeenCalled()
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(postHogStorage()).toEqual([])
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

  it('never asks PostHog for feature switches, even after Accept and an identify', async () => {
    const { client, sent } = startClient()

    await acceptAnalytics(client, { isDev: true, fetchSettings })
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    await flush()

    expect(client.get_distinct_id()).toBe(WALLET)
    expect(sent.filter((request) => request.url.includes('/flags'))).toEqual([])
    expect(fetchSettings).toHaveBeenCalledWith(
      'https://posthog.example/array/test-key/config',
    )
    expect(sent.some((request) => request.url.includes('/api/surveys'))).toBe(
      true,
    )
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
    expect(postHogStorage()).toEqual([])

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

    resetVisitor(client)

    expect(client.get_explicit_consent_status()).toBe(choice)
    expect(storedChoice()).toBe(stored)
  })

  it('cuts addresses and .eth names from error reports', async () => {
    const { client, sent } = startClient()
    await acceptAnalytics(client, { isDev: true, fetchSettings })

    client.captureException(
      new Error(`Lookup of nick.eth for ${WALLET} failed`),
    )
    await flush()

    const reports = eventsIn(sent).filter(
      (event) => event.event === '$exception',
    )
    expect(reports).toHaveLength(1)
    expect(JSON.stringify(reports[0]?.properties.$exception_list)).toContain(
      'Lookup of [name] for [address] failed',
    )
  })
})
