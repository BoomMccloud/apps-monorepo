import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type AnalyticsClient,
  acceptAnalytics,
  collectionOff,
  collectionOn,
  declineAnalytics,
} from './analyticsConsent'

describe('collection settings', () => {
  it('switch the same settings off and on', () => {
    expect(Object.keys(collectionOn({ isDev: false })).sort()).toEqual(
      Object.keys(collectionOff).sort(),
    )
  })

  it('collect nothing before Accept, and keep watching page changes for after it', () => {
    expect(collectionOff).toMatchObject({
      capture_pageview: 'history_change',
      capture_pageleave: false,
      autocapture: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
    })
  })

  it('keep recordings off on a development build, as before the pause', () => {
    expect(collectionOn({ isDev: true }).disable_session_recording).toBe(true)
    expect(collectionOn({ isDev: false }).disable_session_recording).toBe(false)
  })
})

describe('declineAnalytics', () => {
  const fakeClient = () => ({
    config: { token: 'test-key', api_host: 'https://posthog.example' },
    get_explicit_consent_status: vi.fn(() => 'denied' as const),
    get_distinct_id: vi.fn(() => 'visitor'),
    identify: vi.fn(),
    register: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    shutdown: vi.fn(() => Promise.resolve()),
    reset: vi.fn(),
    set_config: vi.fn(),
    _onRemoteConfig: vi.fn(),
  })

  it('opts out before it turns any collection off, so what stopping a part would still send is held back', () => {
    const client = fakeClient()

    declineAnalytics(client satisfies AnalyticsClient)

    const [firstOptOut] = client.opt_out_capturing.mock.invocationCallOrder
    const [turnedOff] = client.set_config.mock.invocationCallOrder
    expect(firstOptOut).toBeLessThan(turnedOff ?? 0)
    expect(client.set_config).toHaveBeenCalledWith(collectionOff)
  })

  it('hands the SDK settings that say the project has no product tours, which it stops only on being told so', () => {
    const client = fakeClient()

    declineAnalytics(client satisfies AnalyticsClient)

    expect(client._onRemoteConfig).toHaveBeenCalledExactlyOnceWith({
      ok: true,
      config: { productTours: false },
    })
  })

  it('lets go of the requests waiting to be tried again after it opts out and before it resets', () => {
    const client = fakeClient()

    declineAnalytics(client satisfies AnalyticsClient)

    const [firstOptOut] = client.opt_out_capturing.mock.invocationCallOrder
    const [shutDown] = client.shutdown.mock.invocationCallOrder
    const [reset] = client.reset.mock.invocationCallOrder
    expect(firstOptOut).toBeLessThan(shutDown ?? 0)
    expect(shutDown).toBeLessThan(reset ?? 0)
  })

  it('puts the choice back after the reset that erases it', () => {
    const client = fakeClient()

    declineAnalytics(client)

    const [, secondOptOut] = client.opt_out_capturing.mock.invocationCallOrder
    const [reset] = client.reset.mock.invocationCallOrder
    expect(client.reset).toHaveBeenCalledWith(true)
    expect(secondOptOut).toBeGreaterThan(reset ?? 0)
  })
})

describe('acceptAnalytics, when the project settings cannot be loaded', () => {
  const acceptedClient = () => ({
    config: { token: 'test-key', api_host: 'https://posthog.example' },
    get_explicit_consent_status: vi.fn(() => 'granted' as const),
    get_distinct_id: vi.fn(() => 'visitor'),
    identify: vi.fn(),
    register: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    shutdown: vi.fn(() => Promise.resolve()),
    reset: vi.fn(),
    set_config: vi.fn(),
    _onRemoteConfig: vi.fn(),
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('tells the SDK there are none, and says so in the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const offline = new Error('offline')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw offline
      }),
    )
    const client = acceptedClient()

    await acceptAnalytics(client satisfies AnalyticsClient, { isDev: false })

    expect(client._onRemoteConfig).toHaveBeenCalledWith({ ok: false })
    expect(warn).toHaveBeenCalledWith(
      '[posthog] project settings failed to load',
      expect.objectContaining({
        _tag: 'ProjectSettingsNotLoaded',
        message: 'the request failed',
        cause: offline,
      }),
    )
  })

  it('does the same when the host answers with an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    const client = acceptedClient()

    await acceptAnalytics(client, { isDev: false })

    expect(client._onRemoteConfig).toHaveBeenCalledWith({ ok: false })
    expect(warn).toHaveBeenCalledWith(
      '[posthog] project settings failed to load',
      expect.objectContaining({
        _tag: 'ProjectSettingsNotLoaded',
        message: 'the host answered 503',
      }),
    )
  })

  it('does the same when the answer is not JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    )
    const client = acceptedClient()

    await acceptAnalytics(client, { isDev: false })

    expect(client._onRemoteConfig).toHaveBeenCalledWith({ ok: false })
    expect(warn).toHaveBeenCalledWith(
      '[posthog] project settings failed to load',
      expect.objectContaining({
        _tag: 'ProjectSettingsNotLoaded',
        message: 'the answer could not be read',
        cause: expect.any(SyntaxError),
      }),
    )
  })

  it('hands the SDK the settings the host answers with, and logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ supportedCompression: ['gzip'] })),
    )
    const client = acceptedClient()

    await acceptAnalytics(client, { isDev: false })

    expect(client._onRemoteConfig).toHaveBeenCalledWith({
      ok: true,
      config: { supportedCompression: ['gzip'] },
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('drops settings that arrive after the visitor has declined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = {
      ...acceptedClient(),
      get_explicit_consent_status: vi.fn(() => 'denied' as const),
    }

    await acceptAnalytics(client, { isDev: false })

    expect(client._onRemoteConfig).not.toHaveBeenCalled()
  })
})
