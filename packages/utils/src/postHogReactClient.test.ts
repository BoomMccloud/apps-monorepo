// @vitest-environment happy-dom
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { describe, expect, it } from 'vitest'
import { reactClientOf } from './postHogReactClient'

describe('the client @posthog/react is given', () => {
  it('is the SDK the apps bundle, which has every call the package makes', () => {
    const sdk = new PostHog()

    expect(reactClientOf(sdk)).toBe(sdk)
  })
})
