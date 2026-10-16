import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type SwitchRulesEnv,
  switchRulesSource,
} from './decide-feature-switches'
import { checkSwitchRules } from './switch-rules'
import { downloadSwitchRules } from './switch-rules-download'
import { readStoredRules, writeStoredRules } from './switch-rules-store'

/** A refresh that could not store new rules; the last good rules stay. */
export class SwitchRulesRefreshFailed extends TaggedError(
  'SwitchRulesRefreshFailed',
)<{ readonly message: string; readonly cause: unknown }> {}

const refreshFailed = (message: string) =>
  new SwitchRulesRefreshFailed({ message, cause: undefined })

/**
 * The scheduled job: download PostHog's switch rules and store them for the
 * requests to read, once they pass the rules check. Rules that fail the check
 * are never stored, and the job throws, so a failed run shows in the Worker's
 * logs while requests go on with the last good rules.
 */
export const refreshSwitchRules = async (
  env: SwitchRulesEnv,
  options: {
    readonly fetchRules?: typeof fetch
    readonly now?: () => Date
  } = {},
): Promise<'stored' | 'unchanged'> => {
  const space = env.POSTHOG_SWITCH_RULES
  const source = switchRulesSource(env)
  if (!space || !source) {
    throw refreshFailed(
      'the switch rules space, the project key or the project secret key is not set',
    )
  }

  const stored = await readStoredRules(space)
  const download = await downloadSwitchRules(source, {
    etag: stored?.etag,
    fetchRules: options.fetchRules,
  })
  if (download.status === 'unchanged') return 'unchanged'
  if (download.status === 'failed') throw refreshFailed(download.reason)

  const problems = await checkSwitchRules(download.rules)
  if (problems.length > 0) {
    throw refreshFailed(
      `the new rules fail the rules check, so the last good rules stay: ${problems.join('; ')}`,
    )
  }
  await writeStoredRules(space, {
    rules: download.rules,
    etag: download.etag,
    storedAt: (options.now ?? (() => new Date()))().toISOString(),
  })
  return 'stored'
}
