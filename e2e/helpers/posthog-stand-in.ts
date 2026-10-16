import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'

/**
 * A stand-in for the PostHog host that records every request it receives.
 *
 * The apps under test are started with `VITE_PUBLIC_POSTHOG_HOST` pointing
 * here, so both the browser SDK and the Manager's server talk to this process
 * instead of PostHog. Browser requests are cross-origin (the apps run on their
 * own ports), so every one of them carries an `Origin` header; the Manager's
 * server fetches the switch rules with none. That is how a recorded request is
 * attributed to the browser or the server. Other programs on the machine may
 * call the port too (a remote-session tool sends `GET /` to each new local
 * port): a request that names no PostHog project is from neither app.
 */

export const POSTHOG_STAND_IN_PORT = Number(
  process.env.POSTHOG_STAND_IN_PORT ?? 4973,
)

export type CapturedEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

export type RecordedRequest = {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly headers: Readonly<Record<string, string | undefined>>
  /** The body as text, decompressed and decoded the way the SDK encoded it. */
  readonly body: string
  /** The PostHog events the body carries, if it carries any. */
  readonly events: readonly CapturedEvent[]
  readonly isFromBrowser: boolean
  /**
   * From neither app: no `Origin`, and no PostHog project named. Every call
   * the apps make to PostHog carries the project's key (`phc_…`) in its
   * path, query or body, or the project's secret key as `Authorization`.
   */
  readonly isFromElsewhere: boolean
  readonly receivedAt: number
}

export type FlagRules = {
  readonly flags: readonly unknown[]
  readonly group_type_mapping: Readonly<Record<string, string>>
  readonly cohorts: Readonly<Record<string, unknown>>
}

export type PostHogStandIn = {
  readonly url: string
  readonly requests: () => readonly RecordedRequest[]
  readonly browserRequests: () => readonly RecordedRequest[]
  readonly serverRequests: () => readonly RecordedRequest[]
  /** Every event the browser has sent, in the order received. */
  readonly browserEvents: () => readonly CapturedEvent[]
  readonly reset: () => void
  readonly close: () => Promise<void>
}

type StandInOptions = {
  readonly port?: number
  /** Served at `/api/feature_flag/local_evaluation`. */
  readonly rules: FlagRules
  /** Served at `/array/<token>/config`. */
  readonly remoteConfig: Readonly<Record<string, unknown>>
  /** Served at `/api/surveys/`. */
  readonly surveys?: readonly unknown[]
}

const GZIP_MAGIC = [0x1f, 0x8b] as const
/** A PostHog project's public key, as each app and the SDK send it. */
const PROJECT_KEY = /phc_[A-Za-z0-9]+/

const decodeBody = (raw: Buffer): string => {
  if (raw.length === 0) return ''
  if (raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1]) {
    return gunzipSync(raw).toString('utf8')
  }
  const text = raw.toString('utf8')
  // Base64 compression, used for beacons and the flags request:
  // `data=<url-encoded base64 of the JSON>`.
  if (text.startsWith('data=')) {
    const encoded = decodeURIComponent(text.slice('data='.length))
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    return decoded.startsWith('[') || decoded.startsWith('{')
      ? decoded
      : encoded
  }
  return text
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toEvent = (value: unknown): CapturedEvent | null =>
  isRecord(value) && typeof value.event === 'string'
    ? {
        event: value.event,
        properties: isRecord(value.properties) ? value.properties : {},
      }
    : null

const eventsIn = (body: string): readonly CapturedEvent[] => {
  if (!body.startsWith('[') && !body.startsWith('{')) return []
  try {
    const parsed: unknown = JSON.parse(body)
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.batch)
        ? parsed.batch
        : [parsed]
    return items
      .map(toEvent)
      .filter((event): event is CapturedEvent => event !== null)
  } catch {
    return []
  }
}

const readBody = (request: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })

const flatHeaders = (
  request: IncomingMessage,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : value,
    ]),
  )

const corsHeaders = (request: IncomingMessage): Record<string, string> => {
  const origin = request.headers.origin
  return origin
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers':
          request.headers['access-control-request-headers'] ?? '*',
        vary: 'Origin',
      }
    : {}
}

const sendJson = (
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  payload: unknown,
): void => {
  response.writeHead(status, {
    ...corsHeaders(request),
    'content-type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

/** What the stand-in answers on a path, as PostHog would answer it. */
const answerFor = (path: string, options: StandInOptions): unknown => {
  if (path.startsWith('/api/feature_flag/local_evaluation')) {
    return options.rules
  }
  if (/^\/array\/[^/]+\/config(\.js)?$/.test(path)) {
    return options.remoteConfig
  }
  if (path.startsWith('/api/surveys')) {
    return { surveys: options.surveys ?? [] }
  }
  if (path.startsWith('/flags')) {
    return {
      flags: {},
      featureFlags: {},
      featureFlagPayloads: {},
      errorsWhileComputingFlags: false,
    }
  }
  return { status: 1 }
}

/**
 * Start the stand-in on its port. Every request is recorded before it is
 * answered, preflights included, so "the host received nothing" means
 * nothing at all reached it.
 */
export const startPostHogStandIn = async (
  options: StandInOptions,
): Promise<PostHogStandIn> => {
  const recorded: RecordedRequest[] = []

  const server: Server = createServer((request, response) => {
    void readBody(request).then((raw) => {
      const url = new URL(request.url ?? '/', 'http://stand-in.invalid')
      const body = decodeBody(raw)
      const headers = flatHeaders(request)
      const isFromBrowser = headers.origin !== undefined
      const hasProjectKey =
        PROJECT_KEY.test(`${url.pathname}${url.search}${body}`) ||
        headers.authorization !== undefined
      recorded.push({
        method: request.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        headers,
        body,
        events: eventsIn(body),
        isFromBrowser,
        isFromElsewhere: !isFromBrowser && !hasProjectKey,
        receivedAt: Date.now(),
      })

      if (request.method === 'OPTIONS') {
        response.writeHead(204, corsHeaders(request))
        response.end()
        return
      }
      sendJson(request, response, 200, answerFor(url.pathname, options))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? POSTHOG_STAND_IN_PORT, '127.0.0.1', () =>
      resolve(),
    )
  })
  const { port } = server.address() as AddressInfo

  const browserRequests = () => recorded.filter((entry) => entry.isFromBrowser)

  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => [...recorded],
    browserRequests,
    serverRequests: () =>
      recorded.filter(
        (entry) => !entry.isFromBrowser && !entry.isFromElsewhere,
      ),
    browserEvents: () => browserRequests().flatMap((entry) => entry.events),
    reset: () => {
      recorded.length = 0
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

// ---------------------------------------------------------------------------
// What the stand-in serves
// ---------------------------------------------------------------------------

/** Anvil account 0, the wallet the browser tests connect. */
export const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
/** Anvil account 1, a wallet the rules do not name. */
export const OTHER_WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const flagRule = (
  id: number,
  key: string,
  groups: readonly unknown[],
): Readonly<Record<string, unknown>> => ({
  id,
  name: key,
  key,
  active: true,
  deleted: false,
  ensure_experience_continuity: false,
  filters: { groups, multivariate: null, payloads: {} },
})

/**
 * The Manager's switches as the stand-in's project defines them: migration
 * for the test wallet only, the language selector for everyone, and the
 * commemorative NFT for no one. Each can be decided from the rules alone.
 */
export const STAND_IN_FLAG_RULES: FlagRules = {
  flags: [
    flagRule(1, 'migration', [
      {
        properties: [
          {
            key: 'address',
            type: 'person',
            operator: 'exact',
            value: [TEST_WALLET.toLowerCase()],
          },
        ],
        rollout_percentage: 100,
      },
    ]),
    flagRule(2, 'i18n', [{ properties: [], rollout_percentage: 100 }]),
    flagRule(3, 'migration-nft', [{ properties: [], rollout_percentage: 0 }]),
  ],
  group_type_mapping: {},
  cohorts: {},
}

/**
 * The project settings the browser SDK loads after Accept: recordings,
 * surveys, heatmaps, dead clicks and performance timings on, as a project
 * that ran them before the pause would have them.
 */
export const STAND_IN_REMOTE_CONFIG: Readonly<Record<string, unknown>> = {
  supportedCompression: ['gzip', 'gzip-js'],
  hasFeatureFlags: false,
  autocapture_opt_out: false,
  autocaptureExceptions: false,
  captureDeadClicks: true,
  capturePerformance: { network_timing: true, web_vitals: true },
  heatmaps: true,
  surveys: true,
  defaultIdentifiedOnly: true,
  elementsChainAsString: true,
  siteApps: [],
  sessionRecording: {
    endpoint: '/s/',
    consoleLogRecordingEnabled: false,
    recorderVersion: 'v2',
    sampleRate: null,
    minimumDurationMilliseconds: null,
    linkedFlag: null,
    networkPayloadCapture: null,
    urlTriggers: [],
    urlBlocklist: [],
    eventTriggers: [],
    scriptConfig: null,
  },
}
