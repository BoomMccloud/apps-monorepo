import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import {
  ALL_SWITCHES_OFF,
  FEATURE_SWITCH_NAMES,
  type FeatureSwitches,
} from './feature-flags'
import { evaluateStoredSwitches, switchVisitor } from './switchRules'
import { type ReaderProblem, switchRulesReader } from './switchRulesCache'

/** The Worker bindings the switches need. */
export type SwitchRulesEnv = {
  readonly POSTHOG_SWITCH_RULES?: KVNamespace
  readonly POSTHOG_PROJECT_SECRET_API_KEY?: string
}

/**
 * Logged when a request cannot decide the switches and answers them all off,
 * so no switch turns off unnoticed.
 */
class FeatureSwitchesUndecided extends TaggedError('FeatureSwitchesUndecided')<{
  readonly message: string
  readonly cause: unknown
}> {}

/**
 * Logged when the stored rules cannot be read, which would otherwise look
 * like no rules stored.
 */
class StoredSwitchRulesUnreadable extends TaggedError(
  'StoredSwitchRulesUnreadable',
)<{ readonly message: string; readonly cause: unknown }> {}

/**
 * Logged when KV holds a value that is not switch rules, which would
 * otherwise look like no rules stored.
 */
class StoredSwitchRulesUnrecognized extends TaggedError(
  'StoredSwitchRulesUnrecognized',
)<{ readonly message: string; readonly cause: unknown }> {}

// One log line per problem and Worker instance. Remembering what was logged
// is this module's own state, read by nothing else (no-mutation).
const reportedProblems = new Set<string>()

const reportOnce = (
  problem:
    | FeatureSwitchesUndecided
    | StoredSwitchRulesUnreadable
    | StoredSwitchRulesUnrecognized,
): void => {
  const key = `${problem._tag}: ${problem.message}`
  if (reportedProblems.has(key)) return
  reportedProblems.add(key)
  console.error(problem)
}

const switchesUndecided = (message: string) =>
  new FeatureSwitchesUndecided({ message, cause: undefined })

const reportReaderProblem = (problem: ReaderProblem): void =>
  match(problem)
    .with({ status: 'unreadable' }, ({ cause }) =>
      reportOnce(
        new StoredSwitchRulesUnreadable({
          message:
            'the stored switch rules could not be read, so every switch is off until they can',
          cause,
        }),
      ),
    )
    .with({ status: 'unrecognized' }, ({ found }) =>
      reportOnce(
        new StoredSwitchRulesUnrecognized({
          message: `the value stored for the switch rules is ${found}, not switch rules, so every switch is off until the scheduled refresh stores them`,
          cause: undefined,
        }),
      ),
    )
    .exhaustive()

const decide = async (
  env: SwitchRulesEnv,
  wallet: Address | null,
): Promise<FeatureSwitches> => {
  const space = env.POSTHOG_SWITCH_RULES
  if (!space) {
    reportOnce(switchesUndecided('no switch rules space is bound'))
    return ALL_SWITCHES_OFF
  }
  // A request only reads. The scheduled refresh fetches and stores, so until
  // it has stored any, as for a Worker's first deploy (KV persists across the
  // later ones) or on a preview, where crons do not run, every switch is off
  // and the reason is logged.
  const { answers, hasRules } = await evaluateStoredSwitches(
    switchRulesReader(space, reportReaderProblem),
    switchVisitor(wallet),
  )
  if (!hasRules) {
    reportOnce(
      switchesUndecided(
        'no switch rules are stored, so every switch is off until the scheduled refresh stores them',
      ),
    )
    return ALL_SWITCHES_OFF
  }
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

/**
 * Every switch for one visitor, decided on the server from PostHog's rules
 * as the scheduled refresh stored them: for the wallet when there is one, and
 * alike for every visitor without one. The wallet never leaves the Worker.
 * When the rules cannot decide every switch, or deciding fails in any way,
 * every switch is off and the reason is logged: the switches are never a
 * reason for a page not to render.
 */
export const decideFeatureSwitches = (
  env: SwitchRulesEnv,
  wallet: Address | null,
): Promise<FeatureSwitches> =>
  decide(env, wallet).catch((cause: unknown) => {
    reportOnce(
      new FeatureSwitchesUndecided({
        message: 'deciding the switches failed',
        cause,
      }),
    )
    return ALL_SWITCHES_OFF
  })
