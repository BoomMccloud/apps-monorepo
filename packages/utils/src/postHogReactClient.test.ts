// @vitest-environment happy-dom
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { describe, expect, it } from 'vitest'
import { reactClientOf } from './postHogReactClient'

/** The calls @posthog/react 1.10 makes on the client it is given. */
const CALLS = [
  'capture',
  'captureException',
  'getFeatureFlag',
  'getFeatureFlagResult',
  'isFeatureEnabled',
  'onFeatureFlags',
] as const

const clientWithout = (missing?: (typeof CALLS)[number]) =>
  Object.fromEntries(
    CALLS.filter((call) => call !== missing).map((call) => [call, () => {}]),
  )

describe('the client @posthog/react is given', () => {
  it('is the SDK the apps bundle, which has every call the package makes', () => {
    const sdk = new PostHog()

    expect(reactClientOf(sdk)).toBe(sdk)
  })

  it('is any object with every call the package makes', () => {
    const client = clientWithout()

    expect(reactClientOf(client)).toBe(client)
  })

  it.each(CALLS)('is none when the client lacks %s', (call) => {
    expect(reactClientOf(clientWithout(call))).toBeNull()
  })

  it.each([undefined, null, 'posthog', 7, []])('is none for %j', (client) => {
    expect(reactClientOf(client)).toBeNull()
  })
})
