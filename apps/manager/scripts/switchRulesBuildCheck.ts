import { match, P } from 'ts-pattern'
import {
  type FetchSwitchRulesOptions,
  fetchSwitchRules,
  type SwitchRulesSource,
} from '../src/lib/posthog/fetchSwitchRules'
import { switchRulesWriter } from '../src/lib/posthog/switchRulesCache'

const SECRET_KEY_NAME = 'POSTHOG_PROJECT_SECRET_API_KEY'

type SwitchRulesBuildCheck = {
  readonly status: 'passed' | 'skipped' | 'failed'
  readonly message: string
}

const passed = (message: string): SwitchRulesBuildCheck => ({
  status: 'passed',
  message,
})
const skipped = (message: string): SwitchRulesBuildCheck => ({
  status: 'skipped',
  message,
})
const failed = (message: string): SwitchRulesBuildCheck => ({
  status: 'failed',
  message,
})

/**
 * What the build holds of the three inputs the check needs, or the check's
 * own verdict when one is missing. A Cloudflare Workers build (WORKERS_CI=1)
 * must hold the key, or every switch would be off once deployed; with
 * `isSkippedWithoutKey`, any other build without the key skips the check and
 * says so.
 */
const sourceOf = (
  env: Readonly<Record<string, string | undefined>>,
  options: { readonly isSkippedWithoutKey: boolean },
): SwitchRulesSource | SwitchRulesBuildCheck =>
  match({
    secretKey: env[SECRET_KEY_NAME],
    projectKey: env.VITE_PUBLIC_POSTHOG_KEY,
    host: env.VITE_PUBLIC_POSTHOG_HOST,
  })
    .with({ secretKey: P.union(undefined, '') }, () =>
      options.isSkippedWithoutKey && env.WORKERS_CI !== '1'
        ? skipped(`switch rules check skipped: ${SECRET_KEY_NAME} is not set`)
        : failed(
            `${SECRET_KEY_NAME} is not set, so the deployed Manager would have every switch off.`,
          ),
    )
    .with(
      P.union(
        { projectKey: P.union(undefined, '') },
        { host: P.union(undefined, '') },
      ),
      () =>
        failed(
          'VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST must be set.',
        ),
    )
    .with(
      { secretKey: P.string, projectKey: P.string, host: P.string },
      (source) => source,
    )
    .exhaustive()

const checkLiveRules = async (
  source: SwitchRulesSource,
  options: FetchSwitchRulesOptions,
): Promise<SwitchRulesBuildCheck> => {
  const writer = switchRulesWriter(async () => {})
  const fetched = await fetchSwitchRules(source, writer.provider, options)
  if (fetched.isErr()) return failed(fetched.error.message)
  return match(writer.outcome())
    .with({ status: 'accepted' }, ({ rules }) =>
      passed(
        `switch rules ok: ${rules.flags.length} rules decide every switch`,
      ),
    )
    .with({ status: 'refused' }, ({ issues }) => failed(issues.join('\n')))
    .with({ status: 'unwritten' }, () =>
      failed('the switch rules could not be written'),
    )
    .with(undefined, () => failed('the switch rules could not be checked'))
    .exhaustive()
}

/**
 * The rules check against the live project: have PostHog's SDK fetch the
 * switch rules with the project secret key, as the scheduled refresh does,
 * and fail when the server could not decide every switch from them, so no
 * switch turns off unnoticed once deployed. The Writer of the refresh does
 * the check, with nothing to write to.
 *
 * `env` is the environment of the build, so the check reads the project and
 * host the build will compile in, whichever Vite mode it runs in.
 *
 * A download that fails fails the check too, so a build that holds the key is
 * as available as PostHog is: a build that deploys must not ship rules it
 * could not check. A build without the key skips the check, except a Workers
 * build. A Storybook build deploys no Worker, so it skips the check whatever
 * else the env holds; Storybook sets STORYBOOK=true before it loads the Vite
 * config.
 *
 * Build only: imported by vite.config.ts and scripts/checkSwitchRules.ts,
 * never by the Worker or the browser bundle. Keep every import here, and in
 * what it reaches, a relative path.
 */
export const checkSwitchRulesForBuild = async (
  env: Readonly<Record<string, string | undefined>>,
  options: FetchSwitchRulesOptions & { readonly isSkippedWithoutKey: boolean },
): Promise<SwitchRulesBuildCheck> =>
  env.STORYBOOK === 'true'
    ? skipped('switch rules check skipped: a Storybook build deploys no Worker')
    : match(sourceOf(env, options))
        .with({ host: P.string }, (source) => checkLiveRules(source, options))
        .with({ status: P.string }, async (settled) => settled)
        .exhaustive()
