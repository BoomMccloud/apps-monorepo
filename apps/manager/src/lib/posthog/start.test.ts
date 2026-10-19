import { LEGACY_POSTHOG_PROJECT_KEYS } from '@ens-apps/utils/analyticsLegacyStorage'
import { startAnalyticsSdk } from '@ens-apps/utils/analyticsStart'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SWITCHES_OFF } from './feature-flags'
import { startPostHog } from './start'

vi.mock('@ens-apps/utils/analyticsStart', () => ({
  startAnalyticsSdk: vi.fn(() => 'pending'),
}))
vi.mock('./client', () => ({ default: { stand: 'in' } }))
vi.mock('./config', () => ({ startupConfig: () => ({ api_host: 'host' }) }))

describe('startPostHog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("starts the SDK with the project's key and the Explorer's earlier project, whose leftovers go", () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_current')

    expect(startPostHog(ALL_SWITCHES_OFF)).toBe('pending')

    expect(startAnalyticsSdk).toHaveBeenCalledExactlyOnceWith(
      { stand: 'in' },
      'phc_current',
      { api_host: 'host' },
      {
        isDev: expect.any(Boolean),
        legacyProjectKeys: LEGACY_POSTHOG_PROJECT_KEYS,
      },
    )
    expect(LEGACY_POSTHOG_PROJECT_KEYS).toEqual([
      'phc_1Md3nkBli5dtiu6CE9ERfaCYye84aE8PUhQNBjNdzCh',
    ])
  })
})
