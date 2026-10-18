import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'
import { match } from 'ts-pattern'
import type { SwitchRulesEnv } from './decideFeatureSwitches'
import {
  type FetchSwitchRulesOptions,
  fetchSwitchRules,
  type SwitchRulesSource,
} from './fetchSwitchRules'
import { SWITCH_RULES_KEY, switchRulesWriter } from './switchRulesCache'

/** A refresh that could not store new rules; the last good rules stay. */
class SwitchRulesRefreshFailed extends TaggedError('SwitchRulesRefreshFailed')<{
  readonly message: string
  readonly cause: unknown
}> {}

const refreshFailed = (message: string) =>
  new SwitchRulesRefreshFailed({ message, cause: undefined })

/** The project the switches belong to, or null when it is not configured. */
const switchRulesSource = (env: SwitchRulesEnv): SwitchRulesSource | null => {
  const projectKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST
  const secretKey = env.POSTHOG_PROJECT_SECRET_API_KEY
  return projectKey && host && secretKey
    ? { host, projectKey, secretKey }
    : null
}

/**
 * The scheduled job, after PostHog's Cloudflare KV example: PostHog's SDK
 * fetches the project's switch rules and hands them to the Writer, which
 * stores them for the requests to read once they pass the rules check. Rules
 * that fail the check are never stored; the job returns why, and requests go
 * on with the last good rules. The Worker's entry point turns a failure into
 * a failed run (server.ts).
 *
 * The SDK catches whatever the Writer throws, so the Writer's outcome is read
 * from it once the SDK has finished. Every run fetches the rules whole: a
 * client made for one run holds no ETag to ask with.
 */
export const refreshSwitchRules = ResultFn(async function* (
  env: SwitchRulesEnv,
  options: FetchSwitchRulesOptions = {},
) {
  const space = env.POSTHOG_SWITCH_RULES
  const source = switchRulesSource(env)
  if (!space || !source) {
    return err(
      refreshFailed(
        'the switch rules space, the project key or the project secret key is not set',
      ),
    )
  }

  const writer = switchRulesWriter((rules) =>
    space.put(SWITCH_RULES_KEY, JSON.stringify(rules)),
  )
  yield* fetchSwitchRules(source, writer.provider, options).mapErr((failure) =>
    refreshFailed(failure.message),
  )
  return match(writer.outcome())
    .with({ status: 'accepted' }, () => ok('stored' as const))
    .with({ status: 'refused' }, ({ problems }) =>
      err(
        refreshFailed(
          `the new rules fail the rules check, so the last good rules stay: ${problems.join('; ')}`,
        ),
      ),
    )
    .with({ status: 'unwritten' }, ({ cause }) =>
      err(
        new SwitchRulesRefreshFailed({
          message:
            'the new rules pass the rules check and could not be written to KV',
          cause,
        }),
      ),
    )
    .with(undefined, () =>
      err(refreshFailed('the new rules arrived and could not be checked')),
    )
    .exhaustive()
})
