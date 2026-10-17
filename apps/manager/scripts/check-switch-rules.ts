import { match } from 'ts-pattern'
import { loadEnv } from 'vite'
import { checkSwitchRulesForBuild } from '../src/lib/posthog/switchRulesBuildCheck'

/**
 * The rules check against the live project, run by hand:
 *
 *   tsx scripts/check-switch-rules.ts [--when-configured] [--mode <mode>]
 *
 * `vite build` runs the same check itself (vite.config.ts), in the mode it
 * builds, so a build never needs this script. `--mode` picks the env files the
 * check reads, as it does for Vite (production when not given).
 * `--when-configured` skips the check, and says so, when the secret key is not
 * set.
 */

const isModeGiven = process.argv.includes('--mode')
const mode = isModeGiven
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'production'
if (!mode) {
  console.error('--mode needs a mode, for example --mode mainnet')
  process.exit(1)
}

const check = await checkSwitchRulesForBuild(loadEnv(mode, process.cwd(), ''), {
  isSkippedWithoutKey: process.argv.includes('--when-configured'),
})

match(check)
  .with({ status: 'failed' }, ({ message }) => {
    console.error(`\nFeature switch rules rejected:\n${message}\n`)
    process.exit(1)
  })
  .otherwise(({ message }) => console.log(message))
