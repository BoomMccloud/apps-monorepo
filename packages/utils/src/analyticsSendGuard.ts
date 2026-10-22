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
 * configured with, and to PostHog's own domain, which the SDK sends to when it
 * is given one of PostHog's other host names. A held request is answered as if
 * it were delivered, 200 for a fetch and `true` for a beacon, so the SDK
 * neither retries nor logs it, and what it carried is gone. The SDK sends with
 * `XMLHttpRequest` only where there is no `fetch`, which the apps cannot run
 * without, so that transport is left alone.
 *
 * A Decline ends a period of the visitor's choice (`endConsentPeriod`). A
 * request that left in one period and fails after it ended is answered as
 * delivered too, so that the SDK keeps no copy of it to try again in a later
 * period, after the visitor has accepted again.
 *
 * The SDK keeps the `fetch` it finds when its module loads, so this module has
 * to run before the SDK's. The one module that imports the SDK,
 * postHogClient.ts, imports this first, which holds in a production bundle as
 * well; the guard cannot be the first import of an app's entry instead,
 * because the bundler may run a shared chunk that holds the SDK before the
 * entry's own chunk. It installs itself in a browser only, once.
 */

import { urlOf } from './inputUrl'

/** The part of the SDK the guard reads: where it sends, and the visitor's choice. */
interface GuardedClient {
  readonly config: { readonly api_host: string }
  get_explicit_consent_status(): 'granted' | 'denied' | 'pending'
}

const isGranted = (client: GuardedClient): boolean => {
  try {
    return client.get_explicit_consent_status() === 'granted'
  } catch {
    // An SDK that has not started has no choice to read: nothing is sent.
    return false
  }
}

/** PostHog's own domain: its ingestion hosts, `us.i.posthog.com` and the rest. */
const POSTHOG_DOMAIN = /(?:^|\.)posthog\.com$/iu

/**
 * Whether the address is under the host the SDK sends to, its path included,
 * or on PostHog's own domain: a host that is only a path on the page's own
 * origin holds that path and not the page's other requests, and a host that is
 * empty holds none of them.
 */
const isToHostOf = (
  client: GuardedClient,
  input: RequestInfo | URL,
): boolean => {
  try {
    const base = globalThis.location?.href
    const target = new URL(urlOf(input), base)
    if (POSTHOG_DOMAIN.test(target.hostname)) return true
    if (client.config.api_host.trim() === '') return false
    const host = new URL(client.config.api_host, base)
    const prefix = host.pathname.replace(/\/+$/u, '')
    return (
      target.origin === host.origin &&
      (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))
    )
  } catch {
    // A request to an address that does not parse cannot be sent, and a host
    // that does not parse is one the SDK cannot send to: nothing to hold.
    return false
  }
}

const INSTALLED = '__ensAnalyticsSendGuardInstalled'

/** What the wrappers in place are told: the client to consult, and a Decline. */
interface Guard {
  readonly consult: (client: GuardedClient) => void
  readonly endPeriod: () => void
}

const delivered = (): Response => new Response('{}', { status: 200 })

/**
 * Wrap `fetch` and `sendBeacon` once, in a browser only, and return the calls
 * that tell the wrappers which client to consult and when a Decline ends a
 * period of the choice. They go in when this module loads, before the SDK's
 * module does, and the SDK is started later, so the client reaches them
 * through that call and lives in the closure that reads it. A module evaluated
 * again (a hot reload, a second copy in a bundle) hands its client to the
 * wrappers already in place, through the first call.
 */
const install = (): Guard => {
  let consulted: GuardedClient | undefined
  // The Declines so far; a request leaves in the period this number names.
  let period = 0
  const guard: Guard = {
    consult: (client) => {
      consulted = client
    },
    endPeriod: () => {
      period += 1
    },
  }
  const clientToHostOf = (
    input: RequestInfo | URL,
  ): GuardedClient | undefined => {
    const client = consulted
    return client !== undefined && isToHostOf(client, input)
      ? client
      : undefined
  }
  const isHeld = (input: RequestInfo | URL): boolean => {
    const client = clientToHostOf(input)
    return client !== undefined && !isGranted(client)
  }
  const deliveredIfStale = (answer: Promise<Response>): Promise<Response> => {
    const sentIn = period
    const isStale = (): boolean => period !== sentIn
    return answer.then(
      (response) => (!response.ok && isStale() ? delivered() : response),
      (failure: unknown) => (isStale() ? delivered() : Promise.reject(failure)),
    )
  }

  const page = globalThis as typeof globalThis & { [INSTALLED]?: Guard }
  if (typeof window === 'undefined') return guard
  const installed = page[INSTALLED]
  if (installed) return installed
  page[INSTALLED] = guard

  const send = globalThis.fetch?.bind(globalThis)
  if (send) {
    globalThis.fetch = (input, init) => {
      if (isHeld(input)) return Promise.resolve(delivered())
      const answer = send(input, init)
      return clientToHostOf(input) ? deliveredIfStale(answer) : answer
    }
  }
  const beacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator)
  if (beacon) {
    globalThis.navigator.sendBeacon = (url, data) =>
      isHeld(url) ? true : beacon(url, data)
  }
  return guard
}

const guard = install()

/** Hold back every request to the client's host while its visitor has not accepted. */
export const guardPostHogSends = guard.consult

/** The visitor has declined: what already left and fails from now on is not tried again. */
export const endConsentPeriod = guard.endPeriod
