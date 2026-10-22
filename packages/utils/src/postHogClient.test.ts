import { describe, expect, it, vi } from 'vitest'

// What the client module's imports run, in the order they run.
const evaluated = vi.hoisted((): string[] => [])

vi.mock('./analyticsSendGuard', () => {
  evaluated.push('send guard')
  return {}
})
vi.mock('posthog-js/dist/module.full.no-external', () => {
  evaluated.push('SDK')
  return { default: { capture: vi.fn() } }
})

describe('the PostHog client module', () => {
  it('loads the send guard before the SDK, so the SDK keeps the fetch the guard wrapped', async () => {
    await import('./postHogClient')

    expect(evaluated).toEqual(['send guard', 'SDK'])
  })
})
