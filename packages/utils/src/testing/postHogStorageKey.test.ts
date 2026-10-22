import { describe, expect, it } from 'vitest'
import { isPostHogStorageKey } from './postHogStorageKey'

describe('a cookie or storage entry', () => {
  it.each([
    'ph_phc_key_posthog',
    'ph_phc_key_window_id',
    '__ph_opt_in_out_phc_key',
  ])("named %s is PostHog's", (key) => {
    expect(isPostHogStorageKey(key)).toBe(true)
  })

  it.each([
    'ens.analytics.consent',
    'wagmi.store',
    'graph_ph_cache',
  ])('named %s is not', (key) => {
    expect(isPostHogStorageKey(key)).toBe(false)
  })
})
