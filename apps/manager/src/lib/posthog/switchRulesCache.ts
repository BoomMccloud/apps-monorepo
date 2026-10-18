import type { FlagDefinitionCacheProvider } from 'posthog-node/experimental'
// By path, not by package name: vite.config.ts loads this module through the
// build check before any workspace package can be resolved.
import { isRecord } from '../../../../../packages/utils/src/isRecord'
import { checkSwitchRules, type SwitchRules } from './switchRules'

/**
 * Where the switch rules live: one KV key, holding PostHog's flag definitions
 * as its SDK hands them over. The Reader and the Writer follow PostHog's
 * Cloudflare KV example, which its page on distributed environments points
 * to (`examples/example-cloudflare-kv-cache` in posthog-js, `src/cache.ts`):
 * requests read, the scheduled job writes, and the SDK does the fetching.
 */
export const SWITCH_RULES_KEY = 'switch-rules'

const isSwitchRules = (value: unknown): value is SwitchRules =>
  isRecord(value) &&
  Array.isArray(value.flags) &&
  isRecord(value.groupTypeMapping) &&
  isRecord(value.cohorts)

/**
 * The Reader, for a request: it reads KV and never fetches or writes. A value
 * KV cannot give back, or one of another shape, reads as nothing stored; a
 * failure of KV is reported to `onUnreadable` first.
 */
export const switchRulesReader = (
  space: KVNamespace,
  onUnreadable: (cause: unknown) => void,
): FlagDefinitionCacheProvider => ({
  getFlagDefinitions: () =>
    space.get(SWITCH_RULES_KEY, 'json').then(
      (value: unknown) => (isSwitchRules(value) ? value : undefined),
      (cause: unknown) => {
        onUnreadable(cause)
        return undefined
      },
    ),
  shouldFetchFlagDefinitions: () => false,
  // Never asked: a client told not to fetch has nothing to hand over.
  onFlagDefinitionsReceived: () => {},
  shutdown: () => {},
})

/** What the Writer did with the rules the SDK handed it. */
type WriterOutcome =
  | { readonly status: 'accepted'; readonly rules: SwitchRules }
  | { readonly status: 'refused'; readonly problems: readonly string[] }
  | { readonly status: 'unwritten'; readonly cause: unknown }

const acceptChecked = async (
  rules: SwitchRules,
  write: (rules: SwitchRules) => Promise<void>,
): Promise<WriterOutcome> => {
  const problems = await checkSwitchRules(rules)
  if (problems.length > 0) return { status: 'refused', problems }
  return write(rules).then(
    (): WriterOutcome => ({ status: 'accepted', rules }),
    (cause: unknown): WriterOutcome => ({ status: 'unwritten', cause }),
  )
}

/**
 * The Writer, for the scheduled job: the SDK client made with it fetches the
 * rules and hands each fetch to it. Rules go to `write` only once they pass
 * the rules check, and never before, so rules that fail it never reach KV and
 * the last good rules stay. The SDK catches whatever the Writer throws and
 * takes nothing back, so the Writer keeps what it did for the caller to read
 * once the SDK has finished.
 */
export const switchRulesWriter = (
  write: (rules: SwitchRules) => Promise<void>,
) => {
  let outcome: WriterOutcome | undefined
  const provider: FlagDefinitionCacheProvider = {
    getFlagDefinitions: () => undefined,
    shouldFetchFlagDefinitions: () => true,
    onFlagDefinitionsReceived: async (rules) => {
      outcome = await acceptChecked(rules, write)
    },
    shutdown: () => {},
  }
  return { provider, outcome: (): WriterOutcome | undefined => outcome }
}
