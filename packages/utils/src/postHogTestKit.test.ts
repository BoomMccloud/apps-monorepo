// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { installPostHogNetwork } from './postHogTestKit'

const network = installPostHogNetwork()
const EVENTS_URL = 'https://posthog.example/e/'

describe('the network of the PostHog test kit', () => {
  beforeEach(() => {
    network.reset()
  })

  it('lists a request with the events its body carries', async () => {
    const body = JSON.stringify([{ event: 'ping', properties: {} }])

    await fetch(EVENTS_URL, { method: 'POST', body })

    expect(await network.wire()).toMatchObject([
      {
        via: 'fetch',
        method: 'POST',
        path: '/e/',
        events: [{ event: 'ping' }],
      },
    ])
  })

  it('does not read a body it cannot decode as a request with no events', async () => {
    await fetch(EVENTS_URL, { method: 'POST', body: 'not json' })

    await expect(network.wire()).rejects.toThrow(
      'the test kit cannot decode a body the SDK sent',
    )
  })
})
