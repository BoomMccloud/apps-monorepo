import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'

/**
 * Both apps share one analytics choice and one visitor id, which only name
 * the same visitor inside one PostHog project: the two apps' committed
 * builds must use the same project key and host.
 */

const readEnv = (path: string): Readonly<Record<string, string | undefined>> =>
  parseEnv(readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('one PostHog project for both apps', () => {
  it.each([
    '.env',
    '.env.ci',
  ])('the Manager and the Explorer share its key and host in %s', (file) => {
    const manager = readEnv(`../../../${file}`)
    const explorer = readEnv(`../../../../portal/${file}`)

    expect(manager.VITE_PUBLIC_POSTHOG_KEY).toMatch(/^phc_/)
    expect(explorer.VITE_PUBLIC_POSTHOG_KEY).toBe(
      manager.VITE_PUBLIC_POSTHOG_KEY,
    )
    expect(manager.VITE_PUBLIC_POSTHOG_HOST).toBeTruthy()
    expect(explorer.VITE_PUBLIC_POSTHOG_HOST).toBe(
      manager.VITE_PUBLIC_POSTHOG_HOST,
    )
  })
})
