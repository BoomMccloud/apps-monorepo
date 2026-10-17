import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const CLIENT = '/src/lib/posthog/client.ts'
const TEST_FILE = /\.test(-d)?\.tsx?$/
// An import that carries code: `import type` leaves nothing in the bundle.
const SDK_IMPORT =
  /^import\s+(?!type\s)[^'"]*?\bfrom\s+['"]posthog-js[^'"]*['"]/m

describe('the PostHog client module', () => {
  it('is the only module that imports the SDK, so the send guard loads before the SDK wherever a bundle puts it', () => {
    const importers = Object.entries(sources)
      .filter(([path]) => path !== CLIENT && !TEST_FILE.test(path))
      .filter(([, text]) => SDK_IMPORT.test(text))
      .map(([path]) => path)

    expect(importers).toEqual([])
  })

  it('imports the send guard before the SDK', () => {
    const text = sources[CLIENT] ?? ''
    const guardAt = text.indexOf("import '@ens-apps/utils/analyticsSendGuard'")
    const sdkAt = text.search(SDK_IMPORT)

    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(sdkAt).toBeGreaterThan(guardAt)
  })
})
