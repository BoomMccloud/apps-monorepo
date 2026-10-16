import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'
import { type SwitchRulesEnv, switchRulesSource } from './decideFeatureSwitches'
import { checkSwitchRules, type SwitchRules } from './switchRules'
import { downloadSwitchRules } from './switchRulesDownload'
import { readStoredRules, writeStoredRules } from './switchRulesStore'

/** A refresh that could not store new rules; the last good rules stay. */
export class SwitchRulesRefreshFailed extends TaggedError(
  'SwitchRulesRefreshFailed',
)<{ readonly message: string; readonly cause: unknown }> {}

const refreshFailed = (message: string) =>
  new SwitchRulesRefreshFailed({ message, cause: undefined })

/** Store downloaded rules once they pass the rules check, and never before. */
const storeCheckedRules = async (
  space: KVNamespace,
  download: { readonly rules: SwitchRules; readonly etag: string | null },
  now: () => Date,
): Promise<'stored'> => {
  const problems = await checkSwitchRules(download.rules)
  if (problems.length > 0) {
    throw refreshFailed(
      `the new rules fail the rules check, so the last good rules stay: ${problems.join('; ')}`,
    )
  }
  await writeStoredRules(space, {
    rules: download.rules,
    etag: download.etag,
    storedAt: now().toISOString(),
  })
  return 'stored'
}

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
  return match(download)
    .with({ status: 'unchanged' }, () => 'unchanged' as const)
    .with({ status: 'failed' }, ({ reason }) => {
      throw refreshFailed(reason)
    })
    .with({ status: 'downloaded' }, (downloaded) =>
      storeCheckedRules(space, downloaded, options.now ?? (() => new Date())),
    )
    .exhaustive()
}
