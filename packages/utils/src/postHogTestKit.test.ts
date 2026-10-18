// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { installPostHogNetwork } from './postHogTestKit'

const network = installPostHogNetwork()
const EVENTS_URL = 'https://posthog.example/e/'

const gzipped = async (text: string): Promise<ArrayBuffer> =>
  new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer()

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

  it('lists the events of a gzip body the SDK sends through sendBeacon as a Blob', async () => {
    const body = JSON.stringify([{ event: 'ping', properties: {} }])

    navigator.sendBeacon(EVENTS_URL, new Blob([await gzipped(body)]))

    expect(await network.wire()).toMatchObject([
      { via: 'beacon', path: '/e/', events: [{ event: 'ping' }] },
    ])
  })

  it('lists the events of a gzip body sent as bytes, and of a Blob that holds plain text', async () => {
    const body = JSON.stringify([{ event: 'ping', properties: {} }])

    await fetch(EVENTS_URL, { method: 'POST', body: await gzipped(body) })
    navigator.sendBeacon(EVENTS_URL, new Blob([body], { type: 'text/plain' }))

    expect(await network.wire()).toMatchObject([
      { via: 'fetch', events: [{ event: 'ping' }] },
      { via: 'beacon', events: [{ event: 'ping' }] },
    ])
  })

  it('does not read a body it cannot decode as a request with no events', async () => {
    await fetch(EVENTS_URL, { method: 'POST', body: 'not json' })

    await expect(network.wire()).rejects.toThrow(
      'the test kit cannot decode a body the SDK sent',
    )
  })
})
