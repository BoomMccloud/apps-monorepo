import { expect } from 'vitest'

const TEST_FILE = /\.test(-d)?\.tsx?$/
// An import that carries code: `import type` leaves nothing in the bundle.
const SDK_IMPORT =
  /^import\s+(?!type\s)[^'"]*?\bfrom\s+['"]posthog-js[^'"]*['"]/m

/**
 * No module of an app imports the SDK: the one module that does is the shared
 * client (`postHogClient`), which loads the send guard before the SDK, so the
 * guard comes first wherever a bundle puts the SDK. `sources` is the text of
 * each module of the app by its path, as the app's own `import.meta.glob`
 * reads it.
 */
export const expectClientOwnsSdk = (
  sources: Readonly<Record<string, string>>,
): void => {
  const importers = Object.entries(sources)
    .filter(([path]) => !TEST_FILE.test(path))
    .filter(([, text]) => SDK_IMPORT.test(text))
    .map(([path]) => path)

  expect(importers).toEqual([])
}
