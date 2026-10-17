// @vitest-environment happy-dom
import {
  clearCookies,
  installPostHogNetwork,
  keepHistoryMethods,
  settle,
} from '@ens-apps/utils/postHogTestKit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeatureSwitches } from './feature-flags'

/**
 * The Manager's start-up settings on the real SDK, with every request it would
 * send seen on the network. The choice itself is tested once, on the shared
 * module (`@ens-apps/utils/analyticsConsentSdk.test.ts`); this is what the
 * Manager adds: the switches its server decided, which the SDK reads without
 * asking PostHog. The SDK keeps the `fetch` it finds when it loads, and the
 * send guard wraps the `fetch` it finds when it loads, so the network goes in
 * first, then the consent module, then the SDK.
 */
const network = installPostHogNetwork()
const { acceptAnalytics, identifyWallet, startAnalyticsChoice } = await import(
  '@ens-apps/utils/analyticsConsent'
)
const { PostHog } = await import('posthog-js/dist/module.full.no-external')
const { startupConfig } = await import('./config')

const WALLET = '0x1111111111111111111111111111111111111111'
const CHOICE = { isDev: true } as const
const SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: true,
  'migration-nft': false,
}

const startClient = () => {
  const client = new PostHog()
  client.init('test-key', {
    ...startupConfig(SWITCHES),
    api_host: 'https://posthog.example',
    opt_out_useragent_filter: true,
  })
  return client
}

describe("the Manager's PostHog settings, on the installed SDK", () => {
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

  it("reads the server's switches with no request, and takes new answers whole", async () => {
    const client = startClient()
    expect(startAnalyticsChoice(client, CHOICE)).toBe('pending')

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
    expect(network.fetch).not.toHaveBeenCalled()

    // Even after Accept and an identify, the browser never asks for switches.
    await acceptAnalytics(client, CHOICE)
    identifyWallet(client, {
      address: WALLET,
      chainId: 1,
      connectorName: 'test-wallet',
    })
    await settle(vi.advanceTimersByTimeAsync, 4000)
    const paths = (await network.wire()).map((request) => request.path)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.filter((path) => path.startsWith('/flags'))).toEqual([])
  })
})
