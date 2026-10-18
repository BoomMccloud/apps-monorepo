import { vi } from 'vitest'
import { urlOf } from './inputUrl'
import { eventsIn, type SentEvent } from './postHogEvents'

/**
 * Test support for the real PostHog SDK: the network it sends on, replaced so
 * that every request it would put on the wire is seen, whichever way inside
 * the SDK it got there. Nothing here touches an SDK internal.
 *
 * Order matters, and each test file sets it up itself: the SDK keeps the
 * `fetch` it finds when its module loads, and the send guard wraps the `fetch`
 * it finds when it loads, so the network goes in first, then the consent
 * module (which loads the guard), then the SDK:
 *
 *   const network = installPostHogNetwork()
 *   const consent = await import('@ens-apps/utils/analyticsConsent')
 *   const { PostHog } = await import('posthog-js/dist/module.full.no-external')
 */

/** The project's settings as PostHog serves them, with everything on. */
const PROJECT_SETTINGS = {
  // Once these arrive the SDK gzips what it sends, with the platform's stream.
  supportedCompression: ['gzip', 'gzip-js'],
  sessionRecording: { endpoint: '/s/' },
  surveys: true,
  heatmaps: true,
  capturePerformance: { web_vitals: true },
} as const

/** One request that reached the network, after the send guard. */
type WireRequest = {
  readonly via: 'fetch' | 'beacon'
  readonly method: string
  readonly url: string
  readonly path: string
  readonly events: readonly SentEvent[]
}

type NetworkAnswers = {
  /** What a request carrying events gets, each time one arrives. */
  readonly events?: () => Response | Promise<Response>
  readonly projectSettings?: object
}

/** The answers of PostHog's host, by path. */
export const answering =
  ({
    events = () => Response.json({ status: 1 }),
    projectSettings = PROJECT_SETTINGS,
  }: NetworkAnswers = {}) =>
  async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const { pathname } = new URL(urlOf(input))
    if (/^\/array\/[^/]+\/config$/.test(pathname)) {
      return Response.json(projectSettings)
    }
    if (pathname.startsWith('/api/surveys')) {
      return Response.json({ surveys: [] })
    }
    if (pathname.startsWith('/flags')) {
      return Response.json({ flags: {}, featureFlags: {} })
    }
    return pathname.startsWith('/e') ? events() : Response.json({ status: 1 })
  }

// The SDK encodes a body as gzip bytes, as `data=<base64 of the JSON>`, or as
// plain JSON, according to its compression settings and the request.
const fromBase64 = (text: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(text), (char) => char.charCodeAt(0)),
  )

const gunzip = (bytes: BufferSource): Promise<string> =>
  new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text()

const GZIP_MAGIC_BYTES = [0x1f, 0x8b] as const

const isGzip = (bytes: Uint8Array): boolean =>
  GZIP_MAGIC_BYTES.every((byte, index) => bytes[index] === byte)

// Bytes are gzip when they start as gzip does, and text otherwise: a Blob
// handed to `sendBeacon` holds either, according to the SDK's compression.
const textOfBytes = async (bytes: Uint8Array): Promise<string> =>
  isGzip(bytes)
    ? gunzip(Uint8Array.from(bytes))
    : new TextDecoder().decode(bytes)

const parseBody = (text: string): unknown =>
  JSON.parse(
    text.startsWith('data=')
      ? fromBase64(decodeURIComponent(text.slice('data='.length)))
      : text,
  )

const decodeBody = async (
  raw: string | ArrayBuffer | ArrayBufferView,
): Promise<unknown> => {
  try {
    if (typeof raw === 'string') return parseBody(raw)
    const bytes = ArrayBuffer.isView(raw)
      ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      : new Uint8Array(raw)
    return parseBody(await textOfBytes(bytes))
  } catch (cause) {
    throw new Error('the test kit cannot decode a body the SDK sent', { cause })
  }
}

const rawBody = async (
  body: BodyInit | null | undefined,
): Promise<string | ArrayBuffer | ArrayBufferView | undefined> => {
  if (body instanceof Blob) return body.arrayBuffer()
  if (typeof body === 'string' || ArrayBuffer.isView(body)) return body
  if (body instanceof ArrayBuffer) return body
  return undefined
}

/** One request that reached the network, with the order it was made in. */
const wireRequest = async (
  via: WireRequest['via'],
  method: string,
  address: RequestInfo | URL,
  body: BodyInit | null | undefined,
  order: number,
) => {
  const url = urlOf(address)
  const raw = await rawBody(body)
  return {
    order,
    request: {
      via,
      method,
      url,
      path: new URL(url).pathname,
      events: raw === undefined ? [] : eventsIn(await decodeBody(raw)),
    } satisfies WireRequest,
  }
}

/** Put the network in place of the page's `fetch` and `sendBeacon`. */
export const installPostHogNetwork = (answers: NetworkAnswers = {}) => {
  const fetchStub = vi.fn(answering(answers))
  const beaconStub = vi.fn(
    (_url: string | URL, _data?: BodyInit | null): boolean => true,
  )
  globalThis.fetch = fetchStub
  globalThis.navigator.sendBeacon = beaconStub

  const wire = async (): Promise<readonly WireRequest[]> => {
    const fetched = await Promise.all(
      fetchStub.mock.calls.map(async ([input, init], index) =>
        wireRequest(
          'fetch',
          init?.method ?? 'GET',
          input,
          init?.body,
          fetchStub.mock.invocationCallOrder[index] ?? 0,
        ),
      ),
    )
    const beaconed = await Promise.all(
      beaconStub.mock.calls.map(([url, data], index) =>
        wireRequest(
          'beacon',
          'POST',
          url,
          data,
          beaconStub.mock.invocationCallOrder[index] ?? 0,
        ),
      ),
    )
    return [...fetched, ...beaconed]
      .sort((first, second) => first.order - second.order)
      .map(({ request }) => request)
  }

  /** Forget what was sent and go back to the default answers. */
  const reset = (nextAnswers: NetworkAnswers = answers): void => {
    fetchStub.mockReset()
    fetchStub.mockImplementation(answering(nextAnswers))
    beaconStub.mockClear()
  }

  return { fetch: fetchStub, sendBeacon: beaconStub, wire, reset }
}

/** The events a list of requests carries, in order. */
export const eventsOf = (
  requests: readonly WireRequest[],
): readonly SentEvent[] => requests.flatMap((request) => request.events)

export const eventNames = (requests: readonly WireRequest[]): string[] =>
  eventsOf(requests).map((event) => event.event)

/**
 * The SDK gzips a body with the platform's `CompressionStream`, which finishes
 * in real time and not in fake time. After moving the fake clock, give the
 * real event loop a few turns before looking at the wire.
 */
const realSetTimeout = globalThis.setTimeout
export const settle = async (
  advance: (ms: number) => Promise<unknown>,
  ms: number,
): Promise<void> => {
  await advance(ms)
  for (const _turn of [1, 2, 3, 4]) {
    await new Promise<void>((resolve) => realSetTimeout(resolve, 25))
    await advance(5)
  }
}

/**
 * The SDK wraps the page's history methods for the first client that starts
 * in a window and leaves them wrapped; spies put the originals back at
 * `vi.restoreAllMocks()`, so each test's client wraps them afresh.
 */
export const keepHistoryMethods = (): void => {
  vi.spyOn(history, 'pushState')
  vi.spyOn(history, 'replaceState')
}

/** Set a cookie as another tab or app would have, or clear it with `max-age=0`. */
export const writeCookie = (
  name: string,
  value: string,
  attributes = 'path=/',
): void => {
  // biome-ignore lint/suspicious/noDocumentCookie: The tests set and clear the test document's cookies, as other tabs and apps do.
  document.cookie = `${name}=${value}; ${attributes}`
}

export const clearCookies = (): void => {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (name) writeCookie(name, '', 'max-age=0; path=/')
  }
}

export const cookieValue = (name: string): string | undefined =>
  document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('='))
    .find(([cookieName]) => cookieName === name)?.[1]

/** What the SDK keeps in the page's storage and cookies. */
export const postHogStorage = (): string[] =>
  [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
    ...document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0]?.trim() ?? ''),
  ].filter((key) => /^(__)?ph_/.test(key))
