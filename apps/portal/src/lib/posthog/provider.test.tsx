import {
  acceptAnalytics,
  declineAnalytics,
  followStoredChoice,
  resetVisitor,
  startAnalyticsChoice,
} from '@ens-apps/utils/analyticsConsent'
import { useAnalyticsConsent } from '@ens-apps/utils/analyticsConsentContext'
import { boot, trackEvent, update } from '@intercom/messenger-js-sdk'
import { act, render, screen } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection, useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { PHProvider } from './provider'

const WALLET = '0x1111111111111111111111111111111111111111'

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

const renderProvider = () =>
  render(
    <PHProvider>
      <ConsentProbe />
    </PHProvider>,
  )

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
  } as unknown as ReturnType<typeof useConnection>)
}

describe('PHProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.mocked(posthog.get_explicit_consent_status).mockReturnValue('pending')
    vi.mocked(startAnalyticsChoice).mockReturnValue('pending')
    connected(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts PostHog silent, with no switch requests, and reports the starting choice', () => {
    renderProvider()

    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({
        advanced_disable_flags: true,
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
      }),
    )
    expect(vi.mocked(posthog.init).mock.calls[0]?.[1]).not.toHaveProperty(
      'bootstrap',
    )
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('skips PostHog without a key, and then shows no choice to make', () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    renderProvider()

    expect(posthog.init).not.toHaveBeenCalled()
    expect(screen.getByText('unknown')).toBeInTheDocument()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
  })

  it('boots the support chat without the analytics link before Accept, and links it on Accept', async () => {
    renderProvider()
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })

    await act(async () =>
      screen.getByRole('button', { name: 'accept' }).click(),
    )

    expect(acceptAnalytics).toHaveBeenCalledWith(posthog, { isDev: true })
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'anonymous-visitor',
      recent_replay: 'https://replay.example/1',
    })
    expect(screen.getByText('granted')).toBeInTheDocument()
  })

  it('follows an Accept made in another tab or app, and links the support chat', async () => {
    renderProvider()
    await vi.waitFor(() => expect(followStoredChoice).toHaveBeenCalled())
    const following = vi.mocked(followStoredChoice).mock.calls.at(-1)?.[1]

    act(() => following?.onChange('granted'))

    expect(screen.getByText('granted')).toBeInTheDocument()
    expect(update).toHaveBeenCalledWith({
      posthog_distinct_id: 'anonymous-visitor',
      recent_replay: 'https://replay.example/1',
    })
  })

  it('stops analytics on Decline', async () => {
    renderProvider()

    await act(async () =>
      screen.getByRole('button', { name: 'decline' }).click(),
    )

    expect(declineAnalytics).toHaveBeenCalledWith(posthog)
    expect(screen.getByText('denied')).toBeInTheDocument()
  })

  it('does not identify a connecting wallet before Accept', () => {
    renderProvider()

    connectionCallbacks().onConnect?.({
      address: WALLET,
      chainId: 1,
      connector: { name: 'test-wallet' },
    } as never)

    expect(posthog.identify).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('wallet:connect', {
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test-wallet',
    })
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
  })
})
