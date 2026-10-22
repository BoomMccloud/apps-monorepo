import { transactionManager } from '@ens-apps/transaction-manager'
import {
  declineAnalytics,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analyticsConsent'
import { useAnalyticsConsent } from '@ens-apps/utils/useAnalyticsConsent'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { getFeatureSwitches } from '@/server/posthog/getFeatureSwitches'
import type { DecidedFeatureSwitches, FeatureSwitches } from './feature-flags'
import { PHProvider } from './provider'

const WALLET = '0x1111111111111111111111111111111111111111'
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
  PostHogProvider: ({ children }: { readonly children: ReactNode }) => children,
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
vi.mock('@/server/posthog/getFeatureSwitches', () => ({
  getFeatureSwitches: vi.fn(),
}))
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

  describe('the switches in the SDK', () => {
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
  })

  it('reports failed transaction runs until unmount', () => {
    const unsubscribe = vi.fn()
    const unsubscribeLive = vi.fn()
    vi.mocked(transactionManager.onFailedRunTelemetry).mockReturnValueOnce(
      unsubscribe,
    )
    vi.mocked(transactionManager.onRunTelemetryEvent).mockReturnValueOnce(
      unsubscribeLive,
    )
    const { unmount } = renderProvider()
    const listener = vi.mocked(transactionManager.onFailedRunTelemetry).mock
      .calls[0]?.[0]
    if (!listener) throw new Error('Missing failure telemetry listener')
    const groupCollapsed = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const groupEnd = vi
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => undefined)

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
    // On a development build the run is also written to the console.
    expect(groupCollapsed).toHaveBeenCalledWith(
      '[TM-RUN] failed tx status=error stage=submission',
    )
    expect(info).toHaveBeenCalledWith(
      'summary',
      expect.objectContaining({ runId: 'run', txId: 'tx' }),
    )
    expect(groupEnd).toHaveBeenCalledOnce()
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(unsubscribeLive).toHaveBeenCalledOnce()
  })
})
