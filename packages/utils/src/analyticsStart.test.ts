// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAnalyticsChoice } from './analyticsConsent'
import { type StartableClient, startAnalyticsSdk } from './analyticsStart'

vi.mock('./analyticsConsent', () => ({
  startAnalyticsChoice: vi.fn(() => 'granted'),
}))

const OPTIONS = { isDev: true } as const
const CONFIG = { api_host: 'https://posthog.example' }

const startable = (
  overrides: Readonly<Partial<{ __loaded: boolean; init: () => void }>> = {},
) =>
  ({
    __loaded: true,
    init: vi.fn(),
    ...overrides,
  }) as unknown as StartableClient

describe('startAnalyticsSdk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'posthog')
  })

  it('starts the SDK with the key and the settings, exposes it, and returns the starting choice', () => {
    const client = startable()

    expect(startAnalyticsSdk(client, 'key', CONFIG, OPTIONS)).toBe('granted')

    expect(client.init).toHaveBeenCalledExactlyOnceWith('key', CONFIG)
    expect(startAnalyticsChoice).toHaveBeenCalledExactlyOnceWith(
      client,
      OPTIONS,
    )
    expect((window as Window & { readonly posthog?: unknown }).posthog).toBe(
      client,
    )
  })

  it('forgets the projects the app has left before it starts the SDK, whatever the visitor chose', () => {
    localStorage.setItem('ph_phc_left_posthog', '{"distinct_id":"0xvisitor"}')
    const seenAtInit = vi.fn<(stored: string | null) => void>()
    const client = startable({
      init: () => seenAtInit(localStorage.getItem('ph_phc_left_posthog')),
    })

    startAnalyticsSdk(client, 'key', CONFIG, {
      isDev: true,
      legacyProjectKeys: ['phc_left'],
    })

    expect(seenAtInit).toHaveBeenCalledExactlyOnceWith(null)
    expect(localStorage.getItem('ph_phc_left_posthog')).toBeNull()
    expect(startAnalyticsChoice).toHaveBeenCalledExactlyOnceWith(client, {
      isDev: true,
    })
  })

  it('applies no choice, and returns unknown, when the SDK did not load', () => {
    const client = startable({ __loaded: false })

    expect(startAnalyticsSdk(client, 'key', CONFIG, OPTIONS)).toBe('unknown')

    expect(startAnalyticsChoice).not.toHaveBeenCalled()
  })

  it('never lets a failing start crash the app', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = startable({
      init: () => {
        throw new Error('blocked')
      },
    })

    expect(startAnalyticsSdk(client, 'key', CONFIG, OPTIONS)).toBe('unknown')

    expect(warn).toHaveBeenCalledOnce()
    expect(startAnalyticsChoice).not.toHaveBeenCalled()
  })
})
