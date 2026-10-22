/**
 * What PostHog's host answers, by path, for the two fakes of it the tests run
 * against: the unit tests' network in place of `fetch` (`postHogTestKit`) and
 * the browser tests' stand-in for the host (`e2e/helpers/posthog-stand-in.ts`).
 * Each sends the body in its own runtime's response, and each answers a
 * request that carries events itself, since each can fail or hold one.
 */

/**
 * The project's settings as PostHog serves them to the browser SDK:
 * recordings, surveys, heatmaps, dead clicks and performance timings on, as a
 * project that ran them before the pause would have them. Once they arrive the
 * SDK gzips what it sends.
 */
export const POSTHOG_PROJECT_SETTINGS: Readonly<Record<string, unknown>> = {
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

/** What the host serves, besides the answers every project gets. */
type ServedByPostHog = {
  /** Served at `/array/<token>/config`. */
  readonly projectSettings: Readonly<Record<string, unknown>>
  /** Served at `/api/surveys`. */
  readonly surveys: readonly object[]
  /** Served at `/api/feature_flag/local_evaluation`, to a server that fetches the switch rules. */
  readonly rules?: unknown
}

/** The body PostHog's host answers a request on `path` with. */
export const postHogAnswerFor = (
  path: string,
  served: ServedByPostHog,
): unknown => {
  if (
    served.rules !== undefined &&
    path.startsWith('/api/feature_flag/local_evaluation')
  ) {
    return served.rules
  }
  if (/^\/array\/[^/]+\/config(\.js)?$/.test(path)) {
    return served.projectSettings
  }
  if (path.startsWith('/api/surveys')) {
    return { surveys: served.surveys }
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
