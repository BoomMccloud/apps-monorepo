// By path, not by package name: vite.config.ts loads this module through the
// build check before any workspace package can be resolved, as it loads
// packages/config.
import { isRecord } from '../../../../../packages/utils/src/isRecord'
import type { SwitchRules } from './switchRules'

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
  | { readonly status: 'failed'; readonly reason: string }

/** A download made with the ETag of the rules already held. */
type SwitchRulesRecheck = SwitchRulesDownload | { readonly status: 'unchanged' }

const DOWNLOAD_TIMEOUT_MS = 5_000

/** The same request posthog-node makes for local evaluation. */
export const switchRulesUrl = (source: SwitchRulesSource): string =>
  `${source.host.replace(/\/+$/, '')}/api/feature_flag/local_evaluation?token=${encodeURIComponent(source.projectKey)}&send_cohorts`

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

const requestRules = async (
  source: SwitchRulesSource,
  options: { readonly etag: string | null; readonly fetchRules?: typeof fetch },
): Promise<Response | Error> => {
  const fetchRules = options.fetchRules ?? fetch
  return fetchRules(switchRulesUrl(source), {
    headers: {
      Authorization: `Bearer ${source.secretKey}`,
      'Content-Type': 'application/json',
      ...(options.etag ? { 'If-None-Match': options.etag } : {}),
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  }).catch((cause: unknown) =>
    cause instanceof Error ? cause : new Error(String(cause)),
  )
}

const readRules = async (response: Response): Promise<SwitchRulesDownload> => {
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

const failedRequest = (error: Error): SwitchRulesDownload =>
  failed(`the download failed: ${error.message}`)

/**
 * Download the project's switch rules. Never throws: a failure is a value
 * with its reason, which never includes the secret key.
 */
export const downloadSwitchRules = async (
  source: SwitchRulesSource,
  options: { readonly fetchRules?: typeof fetch } = {},
): Promise<SwitchRulesDownload> => {
  const response = await requestRules(source, { etag: null, ...options })
  return response instanceof Error
    ? failedRequest(response)
    : readRules(response)
}

/**
 * Download the rules again with the ETag of the rules already held: an
 * unchanged set answers 304, which PostHog bills as one request instead of
 * ten. Never throws, as `downloadSwitchRules`.
 */
export const downloadSwitchRulesIfChanged = async (
  source: SwitchRulesSource,
  etag: string,
  options: { readonly fetchRules?: typeof fetch } = {},
): Promise<SwitchRulesRecheck> => {
  const response = await requestRules(source, { etag, ...options })
  if (response instanceof Error) return failedRequest(response)
  return response.status === 304 ? { status: 'unchanged' } : readRules(response)
}
