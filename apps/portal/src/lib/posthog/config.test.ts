// @vitest-environment happy-dom
import {
  clearCookies,
  installPostHogNetwork,
  keepHistoryMethods,
} from '@ens-apps/utils/postHogTestKit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Explorer's start-up settings on the real SDK, with every request it
 * would send seen on the network. The choice itself is tested once, on the
 * shared module (`@ens-apps/utils/analyticsConsentSdk.test.ts`); this is what
 * the Explorer adds: it reads no feature switch, so it never asks PostHog for
 * one, and it sends nothing about a connected wallet before the visitor
 * accepts. The SDK keeps the `fetch` it finds when it loads, and the send guard
 * wraps the `fetch` it finds when it loads, so the network goes in first, then
 * the consent module, then the SDK.
 */
const network = installPostHogNetwork()
const { acceptAnalytics, identifyWallet, startAnalyticsChoice } = await import(
  '@ens-apps/utils/analyticsConsent'
)
const { PostHog } = await import('posthog-js/dist/module.full.no-external')
const { startupConfig } = await import('./config')

const WALLET = '0x1111111111111111111111111111111111111111'
const CHOICE = { isDev: true } as const

const startClient = () => {
  const client = new PostHog()
  client.init('test-key', {
    ...startupConfig(),
    api_host: 'https://posthog.example',
    opt_out_useragent_filter: true,
  })
  return client
}

describe("the Explorer's PostHog settings, on the installed SDK", () => {
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

  it('sends nothing before a choice, not even about a connected wallet, and never asks for feature switches', async () => {
    const client = startClient()
    expect(startAnalyticsChoice(client, CHOICE)).toBe('pending')

    // The identify the Explorer makes on connect, for switch targeting, is gone.
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    client.capture('wallet:connect', { wallet_address: WALLET })
    await vi.advanceTimersByTimeAsync(4000)
    expect(await network.wire()).toEqual([])
    expect(client.get_distinct_id()).not.toBe(WALLET)

    // The control: accepted, the same SDK reaches the network, and still asks
    // for no switch.
    await acceptAnalytics(client, CHOICE)
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    await vi.advanceTimersByTimeAsync(4000)
    const paths = (await network.wire()).map((request) => request.path)
    expect(client.get_distinct_id()).toBe(WALLET)
    expect(paths.filter((path) => path.startsWith('/e'))).not.toEqual([])
    expect(paths.filter((path) => path.startsWith('/flags'))).toEqual([])
  })
})
