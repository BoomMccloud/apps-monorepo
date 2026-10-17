/**
 * Nothing leaves the page for PostHog unless the visitor has accepted.
 *
 * The check sits on `fetch` and `navigator.sendBeacon`, the last step before
 * bytes leave, so it holds whichever way the SDK got there: a batch, a retry,
 * a request in flight at Decline that then fails, another tab's queue, an
 * event captured in the same task as the press, a page unload. It reads the
 * choice through the SDK's public status call alone, so a choice changed or
 * removed in another tab applies at once, and a visitor who has not chosen
 * counts as declined. It acts only on requests to the host the SDK was
 * configured with. A held request is answered as if it were delivered, 200 for
 * a fetch and `true` for a beacon, so the SDK neither retries nor logs it, and
 * what it carried is gone.
 *
 * The SDK keeps the `fetch` it finds when its module loads, so this module has
 * to run before the SDK's. In each app the one module that imports the SDK,
 * lib/posthog/client.ts, imports this first, which holds in a production
 * bundle as well; the guard cannot be the first import of the app's entry
 * instead, because the bundler may run a shared chunk that holds the SDK
 * before the entry's own chunk. It installs itself in a browser only, once.
 */

/** The part of the SDK the guard reads: where it sends, and the visitor's choice. */
export interface GuardedClient {
  readonly config: { readonly api_host: string }
  get_explicit_consent_status(): 'granted' | 'denied' | 'pending'
}

// The client the guard consults, set when the SDK starts. This module's own
// record, read by nothing else (no-mutation).
const guarded: { client: GuardedClient | undefined } = { client: undefined }

/** Hold back every request to the client's host while its visitor has not accepted. */
export const guardPostHogSends = (client: GuardedClient): void => {
  guarded.client = client
}

const isGranted = (client: GuardedClient): boolean => {
  try {
    return client.get_explicit_consent_status() === 'granted'
  } catch {
    // An SDK that has not started has no choice to read: nothing is sent.
    return false
  }
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url

const isToHostOf = (
  client: GuardedClient,
  input: RequestInfo | URL,
): boolean => {
  try {
    const base = globalThis.location?.href
    return (
      new URL(urlOf(input), base).origin ===
      new URL(client.config.api_host, base).origin
    )
  } catch {
    return false
  }
}

const isHeld = (input: RequestInfo | URL): boolean => {
  const { client } = guarded
  return client !== undefined && isToHostOf(client, input) && !isGranted(client)
}

const INSTALLED = '__ensAnalyticsSendGuardInstalled'

const install = (): void => {
  const page = globalThis as typeof globalThis & { [INSTALLED]?: true }
  if (typeof window === 'undefined' || page[INSTALLED]) return
  page[INSTALLED] = true

  const send = globalThis.fetch?.bind(globalThis)
  if (send) {
    globalThis.fetch = (input, init) =>
      isHeld(input)
        ? Promise.resolve(new Response('{}', { status: 200 }))
        : send(input, init)
  }
  const beacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator)
  if (beacon) {
    globalThis.navigator.sendBeacon = (url, data) =>
      isHeld(url) ? true : beacon(url, data)
  }
}

install()
