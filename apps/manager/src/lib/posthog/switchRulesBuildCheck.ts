import { match } from 'ts-pattern'
import { checkSwitchRules, type SwitchRules } from './switchRules'
import { downloadSwitchRules } from './switchRulesDownload'

const SECRET_KEY_NAME = 'POSTHOG_PROJECT_SECRET_API_KEY'

export type SwitchRulesBuildCheck = {
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

const checkRules = async (
  rules: SwitchRules,
): Promise<SwitchRulesBuildCheck> => {
  const problems = await checkSwitchRules(rules)
  return problems.length > 0
    ? failed(problems.join('\n'))
    : passed(`switch rules ok: ${rules.flags.length} rules decide every switch`)
}

/**
 * The rules check against the live project: download PostHog's switch rules
 * with the project secret key and fail when the server could not decide every
 * switch from them, so no switch turns off unnoticed after a deploy.
 *
 * `env` is the environment of the build, so the check reads the project and
 * host the build will compile in, whichever Vite mode it runs in. A Cloudflare
 * Workers build (WORKERS_CI=1) must hold the key, or every switch would be off
 * once deployed; with `isSkippedWithoutKey`, any other build without the key
 * skips the check and says so.
 */
export const checkSwitchRulesForBuild = async (
  env: Readonly<Record<string, string | undefined>>,
  options: {
    readonly isSkippedWithoutKey: boolean
    readonly fetchRules?: typeof fetch
  },
): Promise<SwitchRulesBuildCheck> => {
  const secretKey = env[SECRET_KEY_NAME]
  const isDeployBuild = env.WORKERS_CI === '1'
  if (!secretKey) {
    return options.isSkippedWithoutKey && !isDeployBuild
      ? skipped(`switch rules check skipped: ${SECRET_KEY_NAME} is not set`)
      : failed(
          `${SECRET_KEY_NAME} is not set, so the deployed Manager would have every switch off.`,
        )
  }

  const projectKey = env.VITE_PUBLIC_POSTHOG_KEY
  const host = env.VITE_PUBLIC_POSTHOG_HOST
  if (!projectKey || !host) {
    return failed(
      'VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST must be set.',
    )
  }

  const download = await downloadSwitchRules(
    { host, projectKey, secretKey },
    { fetchRules: options.fetchRules },
  )
  return match(download)
    .with({ status: 'downloaded' }, ({ rules }) => checkRules(rules))
    .with({ status: 'failed' }, ({ reason }) => failed(reason))
    .exhaustive()
}
