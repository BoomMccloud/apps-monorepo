import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  ALL_SWITCHES_OFF,
  FEATURE_SWITCH_NAMES,
  type FeatureSwitches,
} from './feature-flags'
import {
  evaluateSwitches,
  type SwitchRules,
  switchVisitor,
} from './switch-rules'
import {
  downloadSwitchRules,
  type SwitchRulesSource,
} from './switch-rules-download'
import { readStoredRules } from './switch-rules-store'

/** The Worker bindings the switches need. */
export type SwitchRulesEnv = {
  readonly POSTHOG_SWITCH_RULES?: KVNamespace
  readonly POSTHOG_PROJECT_SECRET_API_KEY?: string
}

/**
 * Logged when a request cannot decide the switches and answers them all off,
 * so no switch turns off unnoticed.
 */
export class FeatureSwitchesUndecided extends TaggedError(
  'FeatureSwitchesUndecided',
)<{ readonly message: string; readonly cause: unknown }> {}

/** The project the switches belong to, or null when it is not configured. */
export const switchRulesSource = (
  env: SwitchRulesEnv,
): SwitchRulesSource | null => {
  const projectKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST
  const secretKey = env.POSTHOG_PROJECT_SECRET_API_KEY
  return projectKey && host && secretKey
    ? { host, projectKey, secretKey }
    : null
}

type RequestRules =
  | { readonly status: 'usable'; readonly rules: SwitchRules }
  | { readonly status: 'unusable'; readonly reason: string }

/**
 * The stored rules. Until the scheduled refresh has stored any, as on a new
 * deploy or a preview, where crons do not run, each request downloads its own
 * and stores nothing.
 */
const rulesForRequest = async (
  env: SwitchRulesEnv,
  fetchRules: typeof fetch | undefined,
): Promise<RequestRules> => {
  const stored = env.POSTHOG_SWITCH_RULES
    ? await readStoredRules(env.POSTHOG_SWITCH_RULES).catch(() => null)
    : null
  if (stored) return { status: 'usable', rules: stored.rules }

  const source = switchRulesSource(env)
  if (!source) {
    return {
      status: 'unusable',
      reason: 'no rules are stored and no project secret key is set',
    }
  }
  const download = await downloadSwitchRules(source, { fetchRules })
  if (download.status === 'downloaded') {
    return { status: 'usable', rules: download.rules }
  }
  return {
    status: 'unusable',
    reason:
      download.status === 'failed'
        ? `no rules are stored and ${download.reason}`
        : 'no rules are stored and the download had nothing new',
  }
}

// One log line per problem and Worker instance. Remembering what was logged
// is this module's own state, read by nothing else (no-mutation).
const reportedProblems = new Set<string>()

const reportOnce = (message: string): void => {
  if (reportedProblems.has(message)) return
  reportedProblems.add(message)
  console.error(new FeatureSwitchesUndecided({ message, cause: undefined }))
}

/**
 * Every switch for one visitor, decided on the server from PostHog's rules:
 * for the wallet when there is one, and alike for every visitor without one.
 * The wallet never leaves the Worker. When the rules cannot decide every
 * switch, every switch is off and the reason is logged.
 */
export const decideFeatureSwitches = async (
  env: SwitchRulesEnv,
  wallet: string | null,
  options: { readonly fetchRules?: typeof fetch } = {},
): Promise<FeatureSwitches> => {
  const rules = await rulesForRequest(env, options.fetchRules)
  if (rules.status === 'unusable') {
    reportOnce(rules.reason)
    return ALL_SWITCHES_OFF
  }
  const answers = await evaluateSwitches(rules.rules, switchVisitor(wallet))
  const undecided = FEATURE_SWITCH_NAMES.filter(
    (name) => answers[name] === undefined,
  )
  if (undecided.length > 0) {
    reportOnce(`the rules decide no yes or no for ${undecided.join(', ')}`)
    return ALL_SWITCHES_OFF
  }
  return { ...ALL_SWITCHES_OFF, ...answers }
}
