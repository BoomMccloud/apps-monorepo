import { loadEnv } from 'vite'
import { checkSwitchRules } from '../src/lib/posthog/switch-rules'
import { downloadSwitchRules } from '../src/lib/posthog/switch-rules-download'

/**
 * The rules check against the live project: download PostHog's switch rules
 * with the project secret key and fail when the server could not decide every
 * switch from them, so no switch turns off unnoticed after a deploy.
 *
 * `prebuild` runs it with `--when-configured`. A Cloudflare Workers build
 * (WORKERS_CI=1) must hold the key, or every switch would be off once
 * deployed; any other build without the key skips the check and says so.
 */

const SECRET_KEY_NAME = 'POSTHOG_PROJECT_SECRET_API_KEY'

function fail(message: string): never {
  console.error(`\nFeature switch rules rejected:\n${message}\n`)
  process.exit(1)
}

const whenConfigured = process.argv.includes('--when-configured')
const isDeployBuild = process.env.WORKERS_CI === '1'
const secretKey = process.env[SECRET_KEY_NAME]

if (!secretKey && whenConfigured && !isDeployBuild) {
  console.log(`switch rules check skipped: ${SECRET_KEY_NAME} is not set`)
  process.exit(0)
}
if (!secretKey) {
  fail(
    `${SECRET_KEY_NAME} is not set, so the deployed Manager would have every switch off.`,
  )
}

// `loadEnv` applies the same .env precedence the build itself will see.
const env = loadEnv(
  process.env.NODE_ENV ?? 'production',
  process.cwd(),
  'VITE_',
)
const projectKey = env.VITE_PUBLIC_POSTHOG_KEY
const host = env.VITE_PUBLIC_POSTHOG_HOST
if (!projectKey || !host) {
  fail('VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST must be set.')
}

const download = await downloadSwitchRules({ host, projectKey, secretKey })
if (download.status !== 'downloaded') {
  fail(
    download.status === 'failed'
      ? download.reason
      : 'the download answered 304 to a request without an ETag',
  )
}

const problems = await checkSwitchRules(download.rules)
if (problems.length > 0) fail(problems.join('\n'))
console.log(
  `switch rules ok: ${download.rules.flags.length} rules decide every switch`,
)
