import { useAnalyticsConsent } from '@ens-apps/utils/useAnalyticsConsent'
import { boot } from '@intercom/messenger-js-sdk'
import { render, screen } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { PHProvider } from './provider'

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
    get_distinct_id: vi.fn(() => 'anonymous-visitor'),
    get_session_replay_url: vi.fn(() => 'https://replay.example/1'),
    get_explicit_consent_status: vi.fn(() => 'pending'),
  },
}))
vi.mock('@ens-apps/utils/analyticsConsent', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@ens-apps/utils/analyticsConsent')
  >()),
  followStoredChoice: vi.fn(() => () => {}),
  startAnalyticsChoice: vi.fn(() => 'pending'),
}))
vi.mock('wagmi', () => ({
  useConnection: vi.fn(() => ({ address: undefined, status: 'disconnected' })),
  useConnectionEffect: vi.fn(),
}))

const ConsentProbe = () => <output>{useAnalyticsConsent().consent}</output>

// What the shared hook does is tested once, in packages/utils
// (useConsentChoice.test.tsx); this is what the Explorer adds: its own
// settings, no feature switch, and its support chat.
describe('PHProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("starts PostHog from the Explorer's settings with no feature switch, boots its support chat and gives its pages the choice", () => {
    render(
      <PHProvider>
        <ConsentProbe />
      </PHProvider>,
    )

    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ api_host: 'https://posthog.example' }),
    )
    expect(vi.mocked(posthog.init).mock.calls[0]?.[1]).not.toHaveProperty(
      'bootstrap',
    )
    expect(boot).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID })
    expect(screen.getByText('pending')).toBeInTheDocument()
  })
})
