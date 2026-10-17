import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'
import {
  ALL_SWITCHES_OFF,
  FEATURE_SWITCH_NAMES,
  type FeatureSwitches,
} from './feature-flags'
import {
  checkSwitchRules,
  evaluateSwitches,
  type SwitchRules,
  switchVisitor,
} from './switchRules'
import {
  downloadSwitchRules,
  type SwitchRulesSource,
} from './switchRulesDownload'
import { readStoredRules } from './switchRulesStore'

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

/**
 * Logged when the stored rules cannot be read, which would otherwise look
 * like no rules stored: each request then downloads its own.
 */
export class StoredSwitchRulesUnreadable extends TaggedError(
  'StoredSwitchRulesUnreadable',
)<{ readonly message: string; readonly cause: unknown }> {}

// One log line per problem and Worker instance. Remembering what was logged
// is this module's own state, read by nothing else (no-mutation).
const reportedProblems = new Set<string>()

const reportOnce = (
  problem: FeatureSwitchesUndecided | StoredSwitchRulesUnreadable,
): void => {
  const key = `${problem._tag}: ${problem.message}`
  if (reportedProblems.has(key)) return
  reportedProblems.add(key)
  console.error(problem)
}

const switchesUndecided = (message: string) =>
  new FeatureSwitchesUndecided({ message, cause: undefined })

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
 * The rules a download holds, once they pass the rules check: rules that fail
 * it are never stored by the refresh, and are not served either.
 */
const checkedForRequest = async (rules: SwitchRules): Promise<RequestRules> => {
  const problems = await checkSwitchRules(rules)
  return problems.length > 0
    ? {
        status: 'unusable',
        reason: `no rules are stored and the downloaded rules fail the rules check: ${problems.join('; ')}`,
      }
    : { status: 'usable', rules }
}

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
    ? await readStoredRules(env.POSTHOG_SWITCH_RULES).catch(
        (cause: unknown) => {
          reportOnce(
            new StoredSwitchRulesUnreadable({
              message:
                'the stored switch rules could not be read, so each request downloads its own',
              cause,
            }),
          )
          return null
        },
      )
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
  return match(download)
    .with({ status: 'downloaded' }, ({ rules }) => checkedForRequest(rules))
    .with(
      { status: 'failed' },
      ({ reason }): RequestRules => ({
        status: 'unusable',
        reason: `no rules are stored and ${reason}`,
      }),
    )
    .exhaustive()
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
    reportOnce(switchesUndecided(rules.reason))
    return ALL_SWITCHES_OFF
  }
  const answers = await evaluateSwitches(rules.rules, switchVisitor(wallet))
  const undecidedNames = FEATURE_SWITCH_NAMES.filter(
    (name) => answers[name] === undefined,
  )
  if (undecidedNames.length > 0) {
    reportOnce(
      switchesUndecided(
        `the rules decide no yes or no for ${undecidedNames.join(', ')}`,
      ),
    )
    return ALL_SWITCHES_OFF
  }
  return { ...ALL_SWITCHES_OFF, ...answers }
}
