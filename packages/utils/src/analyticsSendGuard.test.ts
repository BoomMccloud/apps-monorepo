// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installPostHogNetwork } from './postHogTestKit'

// The guard wraps the `fetch` and `sendBeacon` it finds when it loads, so the
// network goes in first.
const network = installPostHogNetwork()
const { guardPostHogSends } = await import('./analyticsSendGuard')

const HOST = 'https://posthog.example'
const EVENTS_URL = `${HOST}/e/`

const clientWith = (
  consent: 'granted' | 'denied' | 'pending',
  apiHost = HOST,
) => ({
  config: { api_host: apiHost },
  get_explicit_consent_status: () => consent,
})

// happy-dom's way to give the page an address; its window type does not say so.
const setPageUrl = (url: string): void => {
  const { happyDOM } = window as unknown as {
    readonly happyDOM: { setURL: (url: string) => void }
  }
  happyDOM.setURL(url)
}

describe('the send guard', () => {
  beforeEach(() => {
    network.reset()
  })

  describe.each([
    'denied',
    'pending',
  ] as const)('while the visitor has %s', (consent) => {
    beforeEach(() => {
      guardPostHogSends(clientWith(consent))
    })

    it('holds back a request to PostHog and answers 200, so the SDK does not try it again', async () => {
      const response = await fetch(EVENTS_URL, { method: 'POST', body: '[]' })

      expect(response.status).toBe(200)
      expect(network.fetch).not.toHaveBeenCalled()
    })

    it('holds back a beacon to PostHog and answers that it is queued', () => {
      expect(navigator.sendBeacon(EVENTS_URL, 'data')).toBe(true)
      expect(network.sendBeacon).not.toHaveBeenCalled()
    })

    it('holds back a request given as a URL or a Request', async () => {
      await fetch(new URL(EVENTS_URL))
      await fetch(new Request(EVENTS_URL))

      expect(network.fetch).not.toHaveBeenCalled()
    })

    it('lets a request to any other host through', async () => {
      await fetch('https://rpc.example/')
      navigator.sendBeacon('https://other.example/e/', 'data')

      expect(network.fetch).toHaveBeenCalledOnce()
      expect(network.sendBeacon).toHaveBeenCalledOnce()
    })
  })

  describe('once the visitor has accepted', () => {
    beforeEach(() => {
      guardPostHogSends(clientWith('granted'))
    })

    it('lets requests and beacons to PostHog through', async () => {
      await fetch(EVENTS_URL, { method: 'POST', body: '[]' })
      navigator.sendBeacon(EVENTS_URL, 'data')

      expect(network.fetch).toHaveBeenCalledOnce()
      expect(network.sendBeacon).toHaveBeenCalledOnce()
    })

    it('holds requests back again as soon as the choice changes, whatever asked first', async () => {
      let consent: 'granted' | 'denied' = 'granted'
      guardPostHogSends({
        config: { api_host: HOST },
        get_explicit_consent_status: () => consent,
      })
      await fetch(EVENTS_URL)
      consent = 'denied'
      await fetch(EVENTS_URL)

      expect(network.fetch).toHaveBeenCalledOnce()
    })
  })

  it('holds back every request when the SDK cannot say what the visitor chose', async () => {
    guardPostHogSends({
      config: { api_host: HOST },
      get_explicit_consent_status: vi.fn(() => {
        throw new TypeError('the SDK has not started')
      }),
    })

    await fetch(EVENTS_URL)

    expect(network.fetch).not.toHaveBeenCalled()
  })

  it('compares whole origins, not prefixes', async () => {
    guardPostHogSends(clientWith('denied', HOST))

    await fetch('https://posthog.example.evil.example/e/')
    await fetch('https://posthog.example:8443/e/')

    expect(network.fetch).toHaveBeenCalledTimes(2)
  })

  describe('with a host that has no origin of its own', () => {
    beforeEach(() => {
      setPageUrl('https://app.example/dashboard')
    })

    afterEach(() => {
      setPageUrl('about:blank')
    })

    it("holds the host path on the page's origin and lets the rest of the page through", async () => {
      guardPostHogSends(clientWith('denied', '/ingest'))

      await fetch('https://app.example/ingest/e/')
      await fetch('https://app.example/api/anything')

      expect(network.fetch).toHaveBeenCalledOnce()
      expect(String(network.fetch.mock.calls[0]?.[0])).toBe(
        'https://app.example/api/anything',
      )
    })

    it('holds nothing of the page when the host is empty', async () => {
      guardPostHogSends(clientWith('denied', ''))

      await fetch('https://app.example/api/anything')
      await fetch('https://app.example/_serverFn/x', { method: 'POST' })

      expect(network.fetch).toHaveBeenCalledTimes(2)
    })
  })
})

describe('a second evaluation of the guard module', () => {
  beforeEach(() => {
    network.reset()
  })

  it('hands its client to the wrappers the first evaluation installed', async () => {
    vi.resetModules()
    const again = await import('./analyticsSendGuard')

    again.guardPostHogSends(clientWith('denied'))
    const response = await fetch(EVENTS_URL, { method: 'POST', body: '[]' })

    expect(response.status).toBe(200)
    expect(network.fetch).not.toHaveBeenCalled()
  })
})
