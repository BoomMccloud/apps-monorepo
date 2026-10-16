import type { SwitchRules } from './switch-rules'

/**
 * Where the rules come from: the project's public key names the project, and
 * a project secret key limited to reading feature flags authorizes the read.
 * The download carries nothing about any visitor.
 */
export type SwitchRulesSource = {
  readonly host: string
  readonly projectKey: string
  readonly secretKey: string
}

export type SwitchRulesDownload =
  | {
      readonly status: 'downloaded'
      readonly rules: SwitchRules
      readonly etag: string | null
    }
  | { readonly status: 'unchanged' }
  | { readonly status: 'failed'; readonly reason: string }

const DOWNLOAD_TIMEOUT_MS = 5_000

/** The same request posthog-node makes for local evaluation. */
export const switchRulesUrl = (source: SwitchRulesSource): string =>
  `${source.host.replace(/\/+$/, '')}/api/feature_flag/local_evaluation?token=${encodeURIComponent(source.projectKey)}&send_cohorts`

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type RulesResponse = {
  readonly flags: SwitchRules['flags']
  readonly group_type_mapping?: SwitchRules['groupTypeMapping']
  readonly cohorts?: SwitchRules['cohorts']
}

/**
 * The response checked as far as this code relies on it: a list of keyed
 * rules. posthog-node reads each rule as PostHog sends it, as it would from
 * its own download.
 */
const isRulesResponse = (value: unknown): value is RulesResponse =>
  isRecord(value) &&
  Array.isArray(value.flags) &&
  value.flags.every((flag) => isRecord(flag) && typeof flag.key === 'string') &&
  (value.group_type_mapping === undefined ||
    isRecord(value.group_type_mapping)) &&
  (value.cohorts === undefined || isRecord(value.cohorts))

const failed = (reason: string): SwitchRulesDownload => ({
  status: 'failed',
  reason,
})

/**
 * Download the project's switch rules. With the ETag of the rules already
 * held, an unchanged set answers 304, which PostHog bills as one request
 * instead of ten. Never throws: a failure is a value with its reason, which
 * never includes the secret key.
 */
export const downloadSwitchRules = async (
  source: SwitchRulesSource,
  options: {
    readonly etag?: string | null
    readonly fetchRules?: typeof fetch
  } = {},
): Promise<SwitchRulesDownload> => {
  const fetchRules = options.fetchRules ?? fetch
  const response = await fetchRules(switchRulesUrl(source), {
    headers: {
      Authorization: `Bearer ${source.secretKey}`,
      'Content-Type': 'application/json',
      ...(options.etag ? { 'If-None-Match': options.etag } : {}),
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  }).catch((cause: unknown) =>
    cause instanceof Error ? cause : new Error(String(cause)),
  )
  if (response instanceof Error) {
    return failed(`the download failed: ${response.message}`)
  }
  if (response.status === 304) return { status: 'unchanged' }
  if (!response.ok) return failed(`the download answered ${response.status}`)

  const body: unknown = await response.json().catch(() => undefined)
  if (!isRulesResponse(body)) return failed('the download held no rules')
  return {
    status: 'downloaded',
    etag: response.headers.get('ETag'),
    rules: {
      flags: body.flags,
      groupTypeMapping: body.group_type_mapping ?? {},
      cohorts: body.cohorts ?? {},
    },
  }
}
