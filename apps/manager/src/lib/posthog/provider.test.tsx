import { transactionManager } from '@ens-apps/transaction-manager'
import {
  acceptAnalytics,
  declineAnalytics,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analytics-consent'
import { useAnalyticsConsent } from '@ens-apps/utils/analytics-consent-context'
import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { getFeatureSwitches } from './get-feature-switches'
import { PHProvider } from './provider'

const WALLET = '0x1111111111111111111111111111111111111111'
const SERVER_SWITCHES = { i18n: true, migration: false, 'migration-nft': false }
const WALLET_SWITCHES = { i18n: true, migration: true, 'migration-nft': false }

vi.mock('@tanstack/react-router', () => ({
  rootRouteId: '__root__',
  useHydrated: () => true,
  useLoaderData: () => SERVER_SWITCHES,
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
vi.mock('@ens-apps/utils/analytics-consent', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@ens-apps/utils/analytics-consent')
  >()),
  acceptAnalytics: vi.fn(async () => {}),
  declineAnalytics: vi.fn(),
  resetVisitor: vi.fn(),
  startAnalyticsChoice: vi.fn(() => 'pending'),
}))
vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
  useConnectionEffect: vi.fn(),
}))
vi.mock('./get-feature-switches', () => ({ getFeatureSwitches: vi.fn() }))
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
  return render(
    <QueryClientProvider client={queryClient}>
      <PHProvider>
        <ConsentProbe />
      </PHProvider>
    </QueryClientProvider>,
  )
}

const connectionCallbacks = () => {
  const callbacks = vi.mocked(useConnectionEffect).mock.calls.at(-1)?.[0]
  if (!callbacks)
    throw new Error('PHProvider registered no connection callbacks')
  return callbacks
}

const connected = (address: string | undefined) => {
  vi.mocked(useConnection).mockReturnValue({
    address,
    chainId: 1,
    connector: { name: 'test-wallet' },
    status: address ? 'connected' : 'disconnected',
  } as unknown as ReturnType<typeof useConnection>)
}

describe('PHProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('pending')
    vi.mocked(startAnalyticsChoice).mockReturnValue('pending')
    vi.mocked(getFeatureSwitches).mockResolvedValue(WALLET_SWITCHES)
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

  it("on Decline, stops analytics and puts the server's switches back", async () => {
    renderProvider()

    await act(async () =>
      screen.getByRole('button', { name: 'decline' }).click(),
    )

    expect(declineAnalytics).toHaveBeenCalledWith(posthog)
    expect(posthog.updateFlags).toHaveBeenCalledWith(
      SERVER_SWITCHES,
      undefined,
      {
        merge: false,
      },
    )
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

  it("puts the server's answers for the connected wallet into the SDK", async () => {
    connected(WALLET)
    renderProvider()

    await vi.waitFor(() =>
      expect(posthog.updateFlags).toHaveBeenCalledWith(
        WALLET_SWITCHES,
        undefined,
        {
          merge: false,
        },
      ),
    )
    expect(getFeatureSwitches).toHaveBeenCalledWith({
      data: { wallet: WALLET },
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
