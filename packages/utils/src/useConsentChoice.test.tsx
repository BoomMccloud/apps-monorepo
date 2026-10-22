// @vitest-environment happy-dom
import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { act, renderHook } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptAnalytics,
  declineAnalytics,
  followStoredChoice,
  resetVisitor,
  startAnalyticsChoice,
} from './analyticsConsent'
import type { AnalyticsConsentValue } from './analyticsConsentContext'
import { useConsentChoice } from './useConsentChoice'
import type { WagmiHooks } from './useWalletAnalytics'

const WALLET = '0x1111111111111111111111111111111111111111'
const APP_ID = 'app-id'
const PROJECT_KEY = 'test-key'
const API_HOST = 'https://posthog.example'
// The project the Explorer used before, whose leftovers a start clears.
const LEGACY_PROJECT_KEY = 'phc_1Md3nkBli5dtiu6CE9ERfaCYye84aE8PUhQNBjNdzCh'
const LEGACY_ENTRY = `ph_${LEGACY_PROJECT_KEY}_posthog`
const LINK = {
  posthog_distinct_id: 'anonymous-visitor',
  recent_replay: 'https://replay.example/1',
}
const BLANK_LINK = { posthog_distinct_id: '', recent_replay: '' }

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(() => 'intercom-visitor'),
  trackEvent: vi.fn(),
  update: vi.fn(),
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    get_distinct_id: vi.fn(() => 'anonymous-visitor'),
    get_session_replay_url: vi.fn(() => 'https://replay.example/1'),
    get_explicit_consent_status: vi.fn(() => 'pending'),
  },
}))
vi.mock('./analyticsConsent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./analyticsConsent')>()),
  acceptAnalytics: vi.fn(async () => {}),
  declineAnalytics: vi.fn(),
  followStoredChoice: vi.fn(() => () => {}),
  resetVisitor: vi.fn(),
  startAnalyticsChoice: vi.fn(() => 'pending'),
}))

const wagmi = {
  useConnection: vi.fn<WagmiHooks['useConnection']>(),
  useConnectionEffect: vi.fn<WagmiHooks['useConnectionEffect']>(),
}

const connected = (address: `0x${string}` | undefined) =>
  wagmi.useConnection.mockReturnValue({
    address,
    chainId: 1,
    connector: { name: 'test-wallet' },
  })

const connectionCallbacks = () => {
  const callbacks = wagmi.useConnectionEffect.mock.calls.at(-1)?.[0]
  if (!callbacks) throw new Error('the hook registered no connection callbacks')
  return callbacks
}

const connectWallet = () =>
  connectionCallbacks().onConnect?.({
    address: WALLET,
    chainId: 1,
    connector: { name: 'test-wallet' },
  })

const renderChoice = (
  options: Partial<Parameters<typeof useConsentChoice>[0]> = {},
) =>
  renderHook(() =>
    useConsentChoice({
      wagmi,
      intercomAppId: APP_ID,
      projectKey: PROJECT_KEY,
      apiHost: API_HOST,
      isDev: true,
      ...options,
    }),
  )

/** The choice another tab or app applied, handed to the page as the follower finds it. */
const followedChoice = () => {
  const following = vi.mocked(followStoredChoice).mock.calls.at(-1)?.[1]
  if (!following) throw new Error('the hook follows no choice')
  return following.onChange
}

/** What makes the SDK forget the visitor, as the page meets it. */
const FORGETTING: readonly (readonly [
  string,
  (choice: AnalyticsConsentValue) => void,
])[] = [
  ['a Decline pressed here', (choice) => act(() => choice.decline())],
  [
    'a Decline made in another tab or app',
    () => act(() => followedChoice()('denied')),
  ],
  ['a wallet disconnect', () => connectionCallbacks().onDisconnect?.()],
]

describe('useConsentChoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('pending')
    vi.mocked(startAnalyticsChoice).mockReturnValue('pending')
    connected(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('starting', () => {
    it('starts PostHog silent, with no switch requests, and reports the starting choice', () => {
      const { result } = renderChoice()

      expect(posthog.init).toHaveBeenCalledWith(
        PROJECT_KEY,
        expect.objectContaining({
          api_host: API_HOST,
          advanced_disable_flags: true,
          opt_out_capturing_by_default: true,
          opt_out_persistence_by_default: true,
        }),
      )
      expect(vi.mocked(posthog.init).mock.calls[0]?.[1]).not.toHaveProperty(
        'bootstrap',
      )
      expect(result.current.consent).toBe('pending')
    })

    it('starts once the page is ready, and not before', () => {
      let isReady = false
      const { result, rerender } = renderHook(() =>
        useConsentChoice({
          wagmi,
          intercomAppId: APP_ID,
          projectKey: PROJECT_KEY,
          apiHost: API_HOST,
          isDev: true,
          isReady,
        }),
      )
      expect(posthog.init).not.toHaveBeenCalled()
      expect(result.current.consent).toBe('unknown')

      isReady = true
      rerender()

      expect(posthog.init).toHaveBeenCalledOnce()
      expect(result.current.consent).toBe('pending')
    })

    it("clears what the Explorer's earlier project left on the device, as it starts", () => {
      localStorage.setItem(LEGACY_ENTRY, '{"distinct_id":"0xvisitor"}')

      renderChoice()

      expect(localStorage.getItem(LEGACY_ENTRY)).toBeNull()
    })

    it('skips PostHog without a key, clears nothing, and then shows no choice to make', () => {
      localStorage.setItem(LEGACY_ENTRY, '{"distinct_id":"0xvisitor"}')

      const { result } = renderChoice({ projectKey: '' })

      expect(posthog.init).not.toHaveBeenCalled()
      expect(localStorage.getItem(LEGACY_ENTRY)).not.toBeNull()
      expect(result.current.consent).toBe('unknown')
      expect(boot).toHaveBeenCalledWith({ app_id: APP_ID })
    })

    it('boots the support chat, with no banner, even when PostHog fails to start', () => {
      vi.mocked(posthog.init).mockImplementationOnce(() => {
        throw new Error('init failed')
      })
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const { result } = renderChoice()

      expect(boot).toHaveBeenCalledWith({ app_id: APP_ID })
      expect(result.current.consent).toBe('unknown')
    })
  })

  describe('the support chat', () => {
    it('boots without the analytics link before Accept, and links it on Accept', () => {
      const { result } = renderChoice()
      expect(boot).toHaveBeenCalledWith({ app_id: APP_ID })

      act(() => result.current.accept())

      expect(acceptAnalytics).toHaveBeenCalledWith(posthog, { isDev: true })
      expect(update).toHaveBeenCalledWith(LINK)
      expect(result.current.consent).toBe('granted')
    })

    it('boots with the analytics link when the visitor accepted earlier', () => {
      vi.mocked(startAnalyticsChoice).mockReturnValue('granted')

      renderChoice()

      expect(boot).toHaveBeenCalledWith({ app_id: APP_ID, ...LINK })
    })
  })

  describe('another tab or app', () => {
    it('follows an Accept made there, and links the support chat', () => {
      const { result } = renderChoice()

      act(() => followedChoice()('granted'))

      expect(result.current.consent).toBe('granted')
      expect(update).toHaveBeenCalledWith(LINK)
    })

    it("follows a choice removed there, and blanks the support chat's link", () => {
      const { result } = renderChoice()

      act(() => followedChoice()('pending'))

      expect(result.current.consent).toBe('pending')
      expect(update).toHaveBeenCalledWith(BLANK_LINK)
    })

    it("follows a Decline made there, and blanks the support chat's link", () => {
      const { result } = renderChoice()

      act(() => followedChoice()('denied'))

      expect(result.current.consent).toBe('denied')
      expect(update).toHaveBeenCalledWith(BLANK_LINK)
    })
  })

  describe('Decline', () => {
    it("stops analytics, and blanks the support chat's link to them", () => {
      const { result } = renderChoice()

      act(() => result.current.decline())

      expect(declineAnalytics).toHaveBeenCalledWith(posthog)
      expect(update).toHaveBeenCalledWith(BLANK_LINK)
      expect(result.current.consent).toBe('denied')
    })
  })

  describe('a wallet', () => {
    it('is not identified when it connects before Accept, though the connect is recorded', () => {
      renderChoice()

      connectWallet()

      expect(posthog.identify).not.toHaveBeenCalled()
      expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
        wallet_address: WALLET,
        chain_id: 1,
        wallet_connector: 'test-wallet',
      })
    })

    it('is identified when it connects after Accept, and then the connect is recorded', () => {
      vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('granted')
      renderChoice()

      connectWallet()

      expect(posthog.identify).toHaveBeenCalledWith(
        WALLET,
        { address: WALLET },
        { initial_address: WALLET },
      )
      expect(posthog.capture).toHaveBeenCalledWith('wallet:connect', {
        wallet_address: WALLET,
        chain_id: 1,
        wallet_connector: 'test-wallet',
      })
      expect(
        vi.mocked(posthog.identify).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(posthog.capture).mock.invocationCallOrder[0] ?? 0,
      )
    })

    it('is identified when it was already connected as the visitor accepts', () => {
      connected(WALLET)
      const { result } = renderChoice()
      expect(posthog.identify).not.toHaveBeenCalled()

      vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('granted')
      act(() => result.current.accept())

      expect(posthog.identify).toHaveBeenCalledWith(
        WALLET,
        { address: WALLET },
        { initial_address: WALLET },
      )
      // Tied once on Accept, and again once the wallet was identified.
      expect(update).toHaveBeenCalledTimes(2)
    })

    it('on disconnect, is recorded, then the visitor is forgotten, the choice kept and the chat tied to the new visitor', () => {
      vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('granted')
      renderChoice()
      vi.mocked(update).mockClear()

      connectionCallbacks().onDisconnect?.()

      expect(posthog.capture).toHaveBeenCalledWith(
        'wallet:disconnect',
        undefined,
      )
      expect(resetVisitor).toHaveBeenCalledWith(posthog)
      expect(
        vi.mocked(posthog.capture).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(resetVisitor).mock.invocationCallOrder[0] ?? 0)
      expect(update).toHaveBeenCalledExactlyOnceWith(LINK)
    })
  })

  describe('the app told that the visitor was forgotten', () => {
    it.each(FORGETTING)('after %s', (_when, forget) => {
      const onVisitorReset = vi.fn()
      const { result } = renderChoice({ onVisitorReset })

      forget(result.current)

      expect(onVisitorReset).toHaveBeenCalledOnce()
    })

    it('after neither an Accept nor a choice removed in another tab or app', () => {
      const onVisitorReset = vi.fn()
      const { result } = renderChoice({ onVisitorReset })

      act(() => result.current.accept())
      act(() => followedChoice()('pending'))

      expect(onVisitorReset).not.toHaveBeenCalled()
    })
  })
})
