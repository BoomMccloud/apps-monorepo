import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'
import {
  StoredSwitchRulesUnreadable,
  type SwitchRulesEnv,
  switchRulesSource,
} from './decideFeatureSwitches'
import { checkSwitchRules, type SwitchRules } from './switchRules'
import {
  downloadSwitchRules,
  downloadSwitchRulesIfChanged,
} from './switchRulesDownload'
import { readStoredRules, writeStoredRules } from './switchRulesStore'

/** A refresh that could not store new rules; the last good rules stay. */
class SwitchRulesRefreshFailed extends TaggedError('SwitchRulesRefreshFailed')<{
  readonly message: string
  readonly cause: unknown
}> {}

const refreshFailed = (message: string) =>
  new SwitchRulesRefreshFailed({ message, cause: undefined })

/** Store downloaded rules once they pass the rules check, and never before. */
const storeCheckedRules = async (
  space: KVNamespace,
  download: { readonly rules: SwitchRules; readonly etag: string | null },
): Promise<Result<'stored', SwitchRulesRefreshFailed>> => {
  const problems = await checkSwitchRules(download.rules)
  if (problems.length > 0) {
    return err(
      refreshFailed(
        `the new rules fail the rules check, so the last good rules stay: ${problems.join('; ')}`,
      ),
    )
  }
  await writeStoredRules(space, {
    rules: download.rules,
    etag: download.etag,
  })
  return ok('stored')
}

/**
 * The scheduled job: download PostHog's switch rules and store them for the
 * requests to read, once they pass the rules check. Rules that fail the check
 * are never stored; the job returns why, and requests go on with the last
 * good rules. The Worker's entry point turns a failure into a failed run
 * (server.ts).
 */
export const refreshSwitchRules = async (
  env: SwitchRulesEnv,
  options: { readonly fetchRules?: typeof fetch } = {},
): Promise<Result<'stored' | 'unchanged', SwitchRulesRefreshFailed>> => {
  const space = env.POSTHOG_SWITCH_RULES
  const source = switchRulesSource(env)
  if (!space || !source) {
    return err(
      refreshFailed(
        'the switch rules space, the project key or the project secret key is not set',
      ),
    )
  }

  // A stored value that cannot be read is replaced by a whole download.
  const stored = await readStoredRules(space).catch((cause: unknown) => {
    console.warn(
      new StoredSwitchRulesUnreadable({
        message:
          'the stored switch rules could not be read, so the refresh replaces them',
        cause,
      }),
    )
    return null
  })
  const download = stored?.etag
    ? await downloadSwitchRulesIfChanged(source, stored.etag, options)
    : await downloadSwitchRules(source, options)
  return match(download)
    .with({ status: 'unchanged' }, () => ok('unchanged' as const))
    .with({ status: 'failed' }, ({ reason }) => err(refreshFailed(reason)))
    .with({ status: 'downloaded' }, (downloaded) =>
      storeCheckedRules(space, downloaded),
    )
    .exhaustive()
}
