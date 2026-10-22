import { expectClientOwnsSdk } from '@ens-apps/utils/testing/expectClientOwnsSdk'
import { describe, it } from 'vitest'

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('the PostHog client', () => {
  it('is the shared module, the only one that imports the SDK, so the send guard loads before the SDK wherever a bundle puts it', () => {
    expectClientOwnsSdk(sources)
  })
})
