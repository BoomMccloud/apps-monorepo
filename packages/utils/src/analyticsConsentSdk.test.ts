// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answering,
  clearCookies,
  cookieValue,
  eventNames,
  eventsOf,
  installPostHogNetwork,
  keepHistoryMethods,
  postHogStorage,
  settle,
  writeCookie,
} from './postHogTestKit'

/**
 * The shared choice on the real SDK, every request it would send seen on the
 * network before it leaves. The SDK keeps the `fetch` it finds when it loads,
 * and the send guard wraps the `fetch` it finds when it loads, so the network
 * goes in first, then the consent module, which loads the guard, then the SDK.
 *
 * happy-dom reports `navigator.webdriver`, and the SDK drops every event from
 * what it takes for a bot, so each client turns that filter off, and each test
 * of "nothing is sent" shows events reaching the network once the visitor
 * accepts: it would otherwise pass for any settings. Each Accept is a
 * development build's, recordings off, since the recorder cannot run in
 * happy-dom; the recorder's settings still arrive.
 */
const network = installPostHogNetwork()
const {
  ANALYTICS_CONSENT_COOKIE_NAME,
  acceptAnalytics,
  analyticsStartupConfig,
  collectionOff,
  declineAnalytics,
  errorReportsOn,
  followStoredChoice,
  identifyWallet,
  resetVisitor,
  STORED_CHOICE_CHECK_MS,
  startAnalyticsChoice,
} = await import('./analyticsConsent')
const { PostHog } = await import('posthog-js/dist/module.full.no-external')

const TOKEN = 'test-key'
const API_HOST = 'https://posthog.example'
const WALLET = '0x1111111111111111111111111111111111111111'
const CHOICE = { isDev: true } as const

const startClient = (extra: Readonly<Record<string, unknown>> = {}) => {
  const client = new PostHog()
  client.init(TOKEN, {
    ...analyticsStartupConfig({ apiHost: API_HOST }),
    opt_out_useragent_filter: true,
    // The SDK gzips with the platform's stream, which finishes in real time and
    // not in fake time; the test of the gap that leaves is the one that keeps it.
    disable_compression: true,
    ...extra,
  })
  return client
}

type Client = ReturnType<typeof startClient>

const startAccepted = async (extra: Readonly<Record<string, unknown>> = {}) => {
  const client = startClient(extra)
  startAnalyticsChoice(client, CHOICE)
  await acceptAnalytics(client, CHOICE)
  await flush()
  return client
}

const flush = () => vi.advanceTimersByTimeAsync(4000)

const storedChoice = () => cookieValue(ANALYTICS_CONSENT_COOKIE_NAME)

// The SDK's own cookie for the test project, which holds the visitor id.
const VISITOR_COOKIE_NAME = `ph_${TOKEN}_posthog`

const visitorCookie = (): Readonly<Record<string, unknown>> => {
  const stored = cookieValue(VISITOR_COOKIE_NAME)
  return stored ? JSON.parse(decodeURIComponent(stored)) : {}
}

const sentSince = async (count: number) => (await network.wire()).slice(count)

describe('the analytics choice on the installed SDK', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    clearCookies()
    network.reset()
    keepHistoryMethods()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends nothing and stores nothing before a choice, not even about a connected wallet, and sends once the visitor accepts', async () => {
    const client = startClient()
    expect(startAnalyticsChoice(client, CHOICE)).toBe('pending')

    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    client.capture('wallet:connect', { wallet_address: WALLET })
    client.captureException(new Error('before the choice'))
    history.pushState({}, '', '/before-choice')
    document.body.click()
    await flush()

    expect(await network.wire()).toEqual([])
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(postHogStorage()).toEqual([])
    expect(storedChoice()).toBeUndefined()

    // The control: the same SDK, accepted, reaches the network.
    await acceptAnalytics(client, CHOICE)
    client.capture('wallet:connect', { wallet_address: WALLET })
    await flush()
    expect(eventNames(await network.wire())).toEqual(
      expect.arrayContaining(['$pageview', 'wallet:connect']),
    )
    expect(storedChoice()).toBe('1')
  })

  it('starts collection at once on Accept, and hands the SDK the project settings', async () => {
    const client = startClient()

    await acceptAnalytics(client, CHOICE)
    await flush()

    const wire = await network.wire()
    expect(wire.map((request) => request.url)).toContain(
      `${API_HOST}/array/${TOKEN}/config`,
    )
    expect(client.config).toMatchObject({
      capture_pageview: 'history_change',
      autocapture: true,
      capture_exceptions: errorReportsOn,
      disable_surveys: false,
    })
    // Recordings and surveys start from the project's settings.
    expect(
      client.get_property('$session_recording_remote_config'),
    ).toMatchObject({ enabled: true, endpoint: '/s/' })
    expect(
      wire.some((request) => request.path.startsWith('/api/surveys')),
    ).toBe(true)
  })

  it('never asks PostHog for feature switches, even after Accept and an identify', async () => {
    const client = startClient()

    await acceptAnalytics(client, CHOICE)
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    await flush()

    expect(client.get_distinct_id()).toBe(WALLET)
    expect(
      (await network.wire()).filter((request) =>
        request.path.startsWith('/flags'),
      ),
    ).toEqual([])
  })

  it('captures a page view for each move within the app after Accept', async () => {
    const client = startClient()
    await acceptAnalytics(client, CHOICE)
    await flush()

    history.pushState({}, '', '/after-accept')
    await flush()

    expect(
      eventsOf(await network.wire()).filter(
        (event) =>
          event.event === '$pageview' &&
          event.properties.$pathname === '/after-accept',
      ),
    ).toHaveLength(1)
  })

  it("puts back the SDK's own defaults for what the pause turned off", () => {
    const client = startClient()
    const defaults = new PostHog()
    defaults.init('defaults-key', {
      api_host: API_HOST,
      defaults: '2025-11-30',
    })
    void acceptAnalytics(client, CHOICE)

    // Error reports are set in code; recordings follow the build.
    const changedOnPurpose = new Set([
      'capture_exceptions',
      'disable_session_recording',
      // Heatmaps wait for the project's settings, which arrive after Accept.
      'capture_heatmaps',
    ])
    for (const key of Object.keys(collectionOff)) {
      if (changedOnPurpose.has(key)) continue
      expect(client.config[key as keyof typeof client.config], key).toEqual(
        defaults.config[key as keyof typeof defaults.config],
      )
    }
  })

  describe('Decline', () => {
    it('stops collection, forgets the wallet and keeps the choice', async () => {
      const client = await startAccepted()
      client.identify(WALLET, { address: WALLET })
      await flush()

      declineAnalytics(client)
      await flush()
      const sentAtDecline = (await network.wire()).length

      expect(client.get_explicit_consent_status()).toBe('denied')
      expect(storedChoice()).toBe('0')
      expect(client.get_distinct_id()).not.toBe(WALLET)
      expect(postHogStorage()).toEqual([])

      client.capture('wallet:connect', { wallet_address: WALLET })
      client.captureException(new Error('after decline'))
      await flush()
      expect(await sentSince(sentAtDecline)).toEqual([])
    })

    it('sends nothing from the requests waiting to be tried again', async () => {
      network.fetch.mockImplementation(
        answering({ events: () => new Response('', { status: 502 }) }),
      )
      const client = await startAccepted()
      client.capture('wallet:connect', { wallet_address: WALLET })
      await flush()
      // The request failed, so it waits to be tried again.
      expect(eventNames(await network.wire())).toContain('wallet:connect')

      network.fetch.mockImplementation(answering())
      declineAnalytics(client)
      const sentAtDecline = (await network.wire()).length
      await vi.advanceTimersByTimeAsync(60_000)

      expect(eventNames(await sentSince(sentAtDecline))).toEqual([])
    })

    it('sends nothing from a request in flight at the press that then fails', async () => {
      const answer = Promise.withResolvers<Response>()
      network.fetch.mockImplementation(
        answering({ events: () => answer.promise }),
      )
      const client = await startAccepted()
      client.capture('wallet:connect', { wallet_address: WALLET })
      await flush()
      // The request is on its way, and PostHog answers it only after the press.
      expect(eventNames(await network.wire())).toContain('wallet:connect')

      declineAnalytics(client)
      const sentAtDecline = (await network.wire()).length
      answer.resolve(new Response('', { status: 502 }))
      await vi.advanceTimersByTimeAsync(60_000)

      expect(eventNames(await sentSince(sentAtDecline))).toEqual([])
    })

    it('sends nothing from an event captured in the same task as the press, which the SDK compresses first', async () => {
      const client = await startAccepted({ disable_compression: false })
      const advance = (ms: number) => settle(vi.advanceTimersByTimeAsync, ms)

      // The control: with compression on, an event still reaches the network.
      client.capture(
        'compressed-control',
        { wallet_address: WALLET },
        { send_instantly: true },
      )
      await advance(100)
      expect(eventNames(await network.wire())).toContain('compressed-control')

      const sentBefore = (await network.wire()).length
      client.capture(
        'wallet:connect',
        { wallet_address: WALLET },
        { send_instantly: true },
      )
      declineAnalytics(client)
      await advance(4000)

      expect(eventNames(await sentSince(sentBefore))).toEqual([])
    })

    it('forgets the device, so a later Accept starts afresh', async () => {
      const client = startClient()
      await acceptAnalytics(client, CHOICE)
      client.identify(WALLET, { address: WALLET })
      const deviceBeforeDecline = client.get_property('$device_id')
      expect(deviceBeforeDecline).toEqual(expect.any(String))

      declineAnalytics(client)
      await acceptAnalytics(client, CHOICE)

      expect(client.get_property('$device_id')).not.toBe(deviceBeforeDecline)
    })

    it('sends again once the visitor accepts again, and not what was held back meanwhile', async () => {
      const client = await startAccepted()
      declineAnalytics(client)
      client.capture('while-declined', { wallet_address: WALLET })
      await flush()
      const sentWhileDeclined = (await network.wire()).length

      await acceptAnalytics(client, CHOICE)
      client.capture('after-accept-again', { wallet_address: WALLET })
      await flush()
      await vi.advanceTimersByTimeAsync(60_000)

      const names = eventNames(await sentSince(sentWhileDeclined))
      expect(names).toContain('after-accept-again')
      expect(names).not.toContain('while-declined')
    })
  })

  describe('heatmaps, which buffer clicks without asking about the choice', () => {
    const click = (x: number, y: number) =>
      document.body.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }),
      )

    const heatmapsSince = async (count: number) =>
      (await sentSince(count))
        .flatMap((request) => request.events)
        .filter((event) => event.event === '$$heatmap')

    it('collect no click while the visitor has declined, so a new Accept sends none of them', async () => {
      const client = await startAccepted()
      declineAnalytics(client)

      history.pushState({}, '', '/while-declined')
      click(42, 73)
      const sentWhileDeclined = (await network.wire()).length
      await acceptAnalytics(client, CHOICE)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(
        JSON.stringify(await heatmapsSince(sentWhileDeclined)),
      ).not.toContain('while-declined')
    })

    it('start again after Accept when the project has them on, and send the clicks made then', async () => {
      const client = await startAccepted()
      const sent = (await network.wire()).length

      history.pushState({}, '', '/after-accept')
      click(7, 9)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(JSON.stringify(await heatmapsSince(sent))).toContain(
        'after-accept',
      )
      expect(client.config.capture_heatmaps).toBe(true)
    })

    it('stay off after Accept when the project has them off', async () => {
      network.reset({ projectSettings: { heatmaps: false } })
      const client = await startAccepted()
      const sent = (await network.wire()).length

      click(7, 9)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(await heatmapsSince(sent)).toEqual([])
      expect(client.config.capture_heatmaps).toBe(false)
    })
  })

  it.each([
    ['granted', '1'],
    ['denied', '0'],
  ] as const)('keeps a %s choice through the reset on a wallet disconnect', async (choice, stored) => {
    const client = startClient()
    if (choice === 'granted') {
      await acceptAnalytics(client, CHOICE)
    } else {
      declineAnalytics(client)
    }
    client.identify(WALLET, { address: WALLET })

    resetVisitor(client)

    expect(client.get_explicit_consent_status()).toBe(choice)
    expect(storedChoice()).toBe(stored)
    expect(client.get_distinct_id()).not.toBe(WALLET)
  })

  it('leaves an undecided visitor undecided through a reset', () => {
    const client = startClient()
    resetVisitor(client)
    expect(client.get_explicit_consent_status()).toBe('pending')
    expect(storedChoice()).toBeUndefined()
  })

  describe('another tab or app', () => {
    const startFollowing = async (client: Client) => {
      const onChange = vi.fn()
      return {
        onChange,
        stop: followStoredChoice(client, { ...CHOICE, onChange }),
      }
    }

    it('follows a Decline made there: this tab keeps nothing and sends nothing', async () => {
      const thisTab = await startAccepted()
      thisTab.identify(WALLET, { address: WALLET })
      await flush()
      const { onChange, stop } = await startFollowing(thisTab)

      // Another tab, of this app or another ENS app, declines.
      const otherTab = startClient()
      expect(startAnalyticsChoice(otherTab, CHOICE)).toBe('granted')
      declineAnalytics(otherTab)
      await flush()
      const sentAfterDecline = (await network.wire()).length

      // This tab goes on: the visitor clicks and the page captures.
      await vi.advanceTimersByTimeAsync(STORED_CHOICE_CHECK_MS)
      thisTab.capture('wallet:connect', { wallet_address: WALLET })
      await flush()

      expect(onChange).toHaveBeenCalledWith('denied')
      expect(thisTab.get_distinct_id()).not.toBe(WALLET)
      expect(postHogStorage()).toEqual([])
      expect(eventNames(await sentSince(sentAfterDecline))).toEqual([])
      stop()
    })

    it('sends nothing after the choice was removed there, though it counts as declined', async () => {
      const thisTab = await startAccepted()
      thisTab.identify(WALLET, { address: WALLET })
      await flush()
      const { onChange, stop } = await startFollowing(thisTab)

      // The visitor clears this site's data in another tab: the choice is
      // gone, and so is the visitor's cookie.
      clearCookies()
      expect(thisTab.get_explicit_consent_status()).toBe('pending')
      const sentAtRemoval = (await network.wire()).length
      thisTab.capture('name:search', { name: 'vitalik.eth' })
      await vi.advanceTimersByTimeAsync(STORED_CHOICE_CHECK_MS)
      await flush()

      expect(onChange).toHaveBeenCalledWith('pending')
      expect(eventNames(await sentSince(sentAtRemoval))).toEqual([])
      stop()
    })

    it('sends an event as it is captured, so none waits to leave after the choice was removed there and the visitor accepts again', async () => {
      const thisTab = await startAccepted()
      thisTab.identify(WALLET, { address: WALLET })
      await flush()
      const { stop } = await startFollowing(thisTab)
      const sentBeforeCapture = (await network.wire()).length

      thisTab.capture('wallet:connect', { wallet_address: WALLET })
      await vi.advanceTimersByTimeAsync(0)
      // On the network while the choice stood, with nothing left in a batch.
      expect(eventNames(await sentSince(sentBeforeCapture))).toEqual([
        'wallet:connect',
      ])

      clearCookies()
      // The page notices the removal when it comes back into view.
      window.dispatchEvent(new Event('focus'))
      await acceptAnalytics(thisTab, CHOICE)
      await flush()

      expect(
        eventNames(await sentSince(sentBeforeCapture)).filter(
          (name) => name === 'wallet:connect',
        ),
      ).toHaveLength(1)
      stop()
    })

    it("takes the visitor id another app's reset left in the shared cookie over this app's own", async () => {
      const first = await startAccepted()
      first.identify(WALLET, { address: WALLET })
      await flush()
      expect(visitorCookie().distinct_id).toBe(WALLET)

      // Another ENS app reset the visitor on a disconnect: the shared cookie
      // names a new id, while this app's local storage still holds the wallet.
      writeCookie(
        VISITOR_COOKIE_NAME,
        encodeURIComponent(
          JSON.stringify({ ...visitorCookie(), distinct_id: 'id-after-reset' }),
        ),
      )

      // This app's next page.
      expect(startClient().get_distinct_id()).toBe('id-after-reset')
    })

    it("forgets this tab's window id when the page starts after a decline made there", () => {
      // The visitor accepted in this tab earlier, then declined in another one.
      sessionStorage.setItem(`ph_${TOKEN}_window_id`, '"tab-window"')
      sessionStorage.setItem(`ph_${TOKEN}_primary_window_exists`, 'true')
      writeCookie(ANALYTICS_CONSENT_COOKIE_NAME, '0')

      const client = startClient()
      expect(startAnalyticsChoice(client, CHOICE)).toBe('denied')
      expect(postHogStorage()).toEqual([])
    })
  })

  it('cuts addresses and .eth names from error reports', async () => {
    const client = await startAccepted()

    client.captureException(
      new Error(`Call failed for ${WALLET} on vitalik.eth`),
    )
    await flush()

    const reports = eventsOf(await network.wire()).filter(
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
