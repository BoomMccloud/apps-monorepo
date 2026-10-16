import { transactionManager } from '@ens-apps/transaction-manager'
import {
  acceptAnalytics,
  declineAnalytics,
  followStoredChoice,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analyticsConsent'
import { useAnalyticsConsent } from '@ens-apps/utils/analyticsConsentContext'
import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import {
  ALL_SWITCHES_OFF,
  type DecidedFeatureSwitches,
  type FeatureSwitches,
} from './feature-flags'
import { getFeatureSwitches } from './getFeatureSwitches'
import { PHProvider } from './provider'

const WALLET = '0x1111111111111111111111111111111111111111'
const OTHER_WALLET = '0x2222222222222222222222222222222222222222'
const SERVER_SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: false,
  'migration-nft': false,
}
const WALLET_SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: true,
  'migration-nft': false,
}

// What the server rendered the page with: by default for a visitor with no
// wallet in the connection cookie.
const pageStartMock = vi.hoisted(() => vi.fn<() => DecidedFeatureSwitches>())

vi.mock('@tanstack/react-router', () => ({
  rootRouteId: '__root__',
  useHydrated: () => true,
  useLoaderData: () => pageStartMock(),
}))
vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  getVisitorId: vi.fn(() => 'intercom-visitor'),
  trackEvent: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@posthog/react', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    updateFlags: vi.fn(),
    get_distinct_id: vi.fn(() => 'anonymous-visitor'),
    get_session_replay_url: vi.fn(() => 'https://replay.example/1'),
    get_explicit_consent_status: vi.fn(() => 'pending'),
  },
}))
vi.mock('@ens-apps/utils/analyticsConsent', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@ens-apps/utils/analyticsConsent')
  >()),
  acceptAnalytics: vi.fn(async () => {}),
  declineAnalytics: vi.fn(),
  followStoredChoice: vi.fn(() => () => {}),
  resetVisitor: vi.fn(),
  startAnalyticsChoice: vi.fn(() => 'pending'),
}))
vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
  useConnectionEffect: vi.fn(),
}))
vi.mock('./getFeatureSwitches', () => ({ getFeatureSwitches: vi.fn() }))
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    onFailedRunTelemetry: vi.fn(() => vi.fn()),
    onRunTelemetryEvent: vi.fn(() => vi.fn()),
  },
}))

const ConsentProbe = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  return (
    <div>
      <output>{consent}</output>
      <button onClick={accept} type="button">
        accept
      </button>
      <button onClick={decline} type="button">
        decline
      </button>
    </div>
  )
}

const renderProvider = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // A new element each time: React skips one it has already rendered, and the
  // mocked connection cannot ask for a render itself.
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <PHProvider>
        <ConsentProbe />
      </PHProvider>
    </QueryClientProvider>
  )
  const view = render(tree())
  // The same query client again, after the wallet connection moved.
  return { ...view, rerenderProvider: () => view.rerender(tree()) }
}

const connectionCallbacks = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls.at(-1)?.[0]
  if (!callbacks)
    throw new Error('PHProvider registered no connection callbacks')
  return callbacks
}

const reports = (
  status: ReturnType<typeof useConnection>['status'],
  address: string | undefined,
) => {
  vi.mocked(useConnection).mockReturnValue({
    address,
    chainId: 1,
    connector: { name: 'test-wallet' },
    status,
  } as unknown as ReturnType<typeof useConnection>)
}

const connected = (address: string | undefined) =>
  reports(address ? 'connected' : 'disconnected', address)

const restoring = (address: string | undefined) =>
  reports('reconnecting', address)

const written = (switches: FeatureSwitches) =>
  [switches, undefined, { merge: false }] as const

/** The page once wagmi has restored the stored connection: reconnecting, then the final state. */
const renderRestored = (address: string | undefined) => {
  restoring(address)
  const view = renderProvider()
  connected(address)
  view.rerenderProvider()
  return view
}

describe('PHProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('pending')
    vi.mocked(startAnalyticsChoice).mockReturnValue('pending')
    pageStartMock.mockReturnValue({ wallet: null, switches: SERVER_SWITCHES })
    vi.mocked(getFeatureSwitches).mockResolvedValue({
      wallet: WALLET,
      switches: WALLET_SWITCHES,
    })
    connected(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("starts PostHog with the server's switches and reports the starting choice", async () => {
    renderProvider()

    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({
        bootstrap: { featureFlags: SERVER_SWITCHES },
        advanced_disable_flags: true,
        opt_out_capturing_by_default: true,
      }),
    )
    expect(await screen.findByText('pending')).not.toBeNull()
  })

  it('boots the support chat without the analytics link before Accept, and links it on Accept', async () => {
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: 're9q5yti' })

    await act(async () =>
      screen.getByRole('button', { name: 'accept' }).click(),
    )

    expect(acceptAnalytics).toHaveBeenCalledWith(posthog, { isDev: true })
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'anonymous-visitor',
      recent_replay: 'https://replay.example/1',
    })
    expect(screen.getByText('granted')).not.toBeNull()
  })

  it('boots the support chat with the analytics link when the visitor accepted earlier', () => {
    vi.mocked(startAnalyticsChoice).mockReturnValue('granted')
    renderProvider()

    expect(boot).toHaveBeenCalledWith({
      app_id: 're9q5yti',
      posthog_distinct_id: 'anonymous-visitor',
      recent_replay: 'https://replay.example/1',
    })
  })

  it('on Decline, stops analytics', async () => {
    renderProvider()

    await act(async () =>
      screen.getByRole('button', { name: 'decline' }).click(),
    )

    expect(declineAnalytics).toHaveBeenCalledWith(posthog)
    expect(screen.getByText('denied')).not.toBeNull()
  })

  it('identifies a wallet that connects after Accept, then records the connect', () => {
    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('granted')
    renderProvider()

    connectionCallbacks().onConnect?.({
      address: WALLET,
      chainId: 1,
      connector: { name: 'test-wallet' },
    } as never)

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
    ).toBeLessThan(vi.mocked(posthog.capture).mock.invocationCallOrder[0] ?? 0)
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
  })

  it('never identifies a wallet before Accept', () => {
    renderProvider()

    connectionCallbacks().onConnect?.({
      address: WALLET,
      chainId: 1,
      connector: { name: 'test-wallet' },
    } as never)

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('identifies the wallet already connected when the visitor accepts', async () => {
    connected(WALLET)
    renderProvider()
    expect(posthog.identify).not.toHaveBeenCalled()

    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('granted')
    await act(async () =>
      screen.getByRole('button', { name: 'accept' }).click(),
    )

    expect(posthog.identify).toHaveBeenCalledWith(
      WALLET,
      { address: WALLET },
      { initial_address: WALLET },
    )
  })

  it('on disconnect, records it, then forgets the visitor and keeps the choice', () => {
    renderProvider()

    connectionCallbacks().onDisconnect?.()

    expect(posthog.capture).toHaveBeenCalledWith('wallet:disconnect', undefined)
    expect(resetVisitor).toHaveBeenCalledWith(posthog)
    expect(vi.mocked(posthog.capture).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(resetVisitor).mock.invocationCallOrder[0] ?? 0,
    )
  })

  describe('the switches in the SDK', () => {
    const answersWaiting = () => new Promise<never>(() => {})

    it('writes nothing while wagmi restores the connection, then the answers the page started with for the wallet it restores', () => {
      pageStartMock.mockReturnValue({
        wallet: WALLET,
        switches: WALLET_SWITCHES,
      })
      // wagmi's first report is "disconnected", before it has restored
      // anything; the page's answers are for WALLET and still hold.
      connected(undefined)
      const { rerenderProvider } = renderProvider()
      restoring(WALLET)
      rerenderProvider()
      expect(posthog.updateFlags).not.toHaveBeenCalled()

      connected(WALLET)
      rerenderProvider()

      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(WALLET_SWITCHES),
      )
      expect(getFeatureSwitches).not.toHaveBeenCalled()
    })

    it("writes every switch off for a wallet restored other than the one the page started with, and asks the server for that wallet's", async () => {
      pageStartMock.mockReturnValue({
        wallet: WALLET,
        switches: WALLET_SWITCHES,
      })
      vi.mocked(getFeatureSwitches).mockReturnValue(answersWaiting())

      renderRestored(OTHER_WALLET)

      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(ALL_SWITCHES_OFF),
      )
      expect(getFeatureSwitches).toHaveBeenCalledWith({
        data: { wallet: OTHER_WALLET },
      })
    })

    it("writes the server's answers for the connected wallet", async () => {
      renderRestored(WALLET)

      await vi.waitFor(() =>
        expect(posthog.updateFlags).toHaveBeenLastCalledWith(
          ...written(WALLET_SWITCHES),
        ),
      )
      expect(getFeatureSwitches).toHaveBeenCalledWith({
        data: { wallet: WALLET },
      })
    })

    it('on disconnect, does not write the switches itself, and has them written again once the SDK has been reset', async () => {
      pageStartMock.mockReturnValue({
        wallet: WALLET,
        switches: WALLET_SWITCHES,
      })
      renderRestored(WALLET)
      vi.mocked(posthog.updateFlags).mockClear()

      // The connection is still reported as it was: only the reset is asked for.
      act(() => connectionCallbacks().onDisconnect?.())

      expect(resetVisitor).toHaveBeenCalledWith(posthog)
      expect(posthog.updateFlags).toHaveBeenCalledOnce()
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(WALLET_SWITCHES),
      )
      expect(vi.mocked(resetVisitor).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(posthog.updateFlags).mock.invocationCallOrder[0] ?? 0,
      )
    })

    it('after a disconnect, writes every switch off for a visitor with no wallet until the server has answered for one', async () => {
      pageStartMock.mockReturnValue({
        wallet: WALLET,
        switches: WALLET_SWITCHES,
      })
      vi.mocked(getFeatureSwitches).mockReturnValue(answersWaiting())
      renderRestored(WALLET)
      vi.mocked(posthog.updateFlags).mockClear()

      // wagmi has already moved to "disconnected" when it calls onDisconnect.
      act(() => {
        connected(undefined)
        connectionCallbacks().onDisconnect?.()
      })

      // The page started with WALLET's answers, which are not a departed
      // wallet's to keep.
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(ALL_SWITCHES_OFF),
      )
      expect(posthog.updateFlags).not.toHaveBeenCalledWith(
        ...written(WALLET_SWITCHES),
      )
    })

    it("on Decline, has the switches written again from what is known for the connected wallet, not from the page's start", async () => {
      // The page started for a visitor with no wallet; WALLET connected after.
      renderRestored(WALLET)
      await vi.waitFor(() =>
        expect(posthog.updateFlags).toHaveBeenLastCalledWith(
          ...written(WALLET_SWITCHES),
        ),
      )
      vi.mocked(posthog.updateFlags).mockClear()

      await act(async () =>
        screen.getByRole('button', { name: 'decline' }).click(),
      )

      expect(declineAnalytics).toHaveBeenCalledWith(posthog)
      expect(posthog.updateFlags).toHaveBeenCalledOnce()
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(WALLET_SWITCHES),
      )
      expect(
        vi.mocked(declineAnalytics).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(posthog.updateFlags).mock.invocationCallOrder[0] ?? 0,
      )
    })

    it('on Decline, writes every switch off for a wallet whose answers are not known yet, never the answers the page started with', async () => {
      vi.mocked(getFeatureSwitches).mockReturnValue(answersWaiting())
      renderRestored(WALLET)
      vi.mocked(posthog.updateFlags).mockClear()

      await act(async () =>
        screen.getByRole('button', { name: 'decline' }).click(),
      )

      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(ALL_SWITCHES_OFF),
      )
      expect(posthog.updateFlags).not.toHaveBeenCalledWith(
        ...written(SERVER_SWITCHES),
      )
    })

    it('follows a Decline made in another tab or app, and has the switches written again from what is known for the connected wallet', async () => {
      vi.mocked(startAnalyticsChoice).mockReturnValue('granted')
      renderRestored(WALLET)
      await vi.waitFor(() => expect(followStoredChoice).toHaveBeenCalled())
      await vi.waitFor(() =>
        expect(posthog.updateFlags).toHaveBeenLastCalledWith(
          ...written(WALLET_SWITCHES),
        ),
      )
      const following = vi.mocked(followStoredChoice).mock.calls.at(-1)?.[1]
      vi.mocked(posthog.updateFlags).mockClear()

      act(() => following?.onChange('denied'))

      expect(screen.getByText('denied')).not.toBeNull()
      expect(posthog.updateFlags).toHaveBeenCalledOnce()
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(WALLET_SWITCHES),
      )
    })
  })

  it('reports failed transaction runs until unmount', () => {
    const unsubscribe = vi.fn()
    vi.mocked(transactionManager.onFailedRunTelemetry).mockReturnValueOnce(
      unsubscribe,
    )
    const { unmount } = renderProvider()
    const listener = vi.mocked(transactionManager.onFailedRunTelemetry).mock
      .calls[0]?.[0]
    if (!listener) throw new Error('Missing failure telemetry listener')
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)

    listener({
      run: { txId: 'tx', runId: 'run', status: 'error' },
      summary: { failureStage: 'submission', attemptCount: 1 },
      truncation: { totalEvents: 3, truncated: false, droppedEvents: 0 },
    } as Parameters<NonNullable<typeof listener>>[0])

    expect(posthog.capture).toHaveBeenCalledWith(
      'tm:failed_run',
      expect.objectContaining({
        tm_run_id: 'run',
        tm_tx_id: 'tx',
        tm_failure_stage: 'submission',
        source_app: 'manager',
      }),
    )
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
