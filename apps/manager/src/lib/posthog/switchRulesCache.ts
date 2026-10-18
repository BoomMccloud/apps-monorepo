import type { FlagDefinitionCacheProvider } from 'posthog-node/experimental'
import { match, P } from 'ts-pattern'
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

/** What the Reader tells its caller when it hands the SDK no rules but KV holds something. */
export type ReaderProblem =
  | { readonly status: 'unreadable'; readonly cause: unknown }
  | { readonly status: 'unrecognized'; readonly found: string }

/** What a stored value is, in a few words and without its contents. */
const describeValue = (value: unknown): string =>
  match(value)
    .with(P.array(), () => 'an array')
    .when(isRecord, (record) => {
      const keys = Object.keys(record).sort()
      return `an object with ${keys.length > 0 ? `the keys ${keys.join(', ')}` : 'no keys'}`
    })
    .otherwise((other) => `a ${typeof other}`)

const readStored = (
  value: unknown,
  onProblem: (problem: ReaderProblem) => void,
): SwitchRules | undefined =>
  match(value)
    .with(P.nullish, () => undefined)
    .when(isSwitchRules, (rules) => rules)
    .otherwise((found) => {
      onProblem({ status: 'unrecognized', found: describeValue(found) })
      return undefined
    })

/**
 * The Reader, for a request: it reads KV and never fetches or writes. Nothing
 * stored reads as no rules, without a word. A value KV cannot give back, or
 * one of another shape (the removed store's, say), reads as no rules too, and
 * is reported to `onProblem` first, so it is not mistaken for nothing stored.
 */
export const switchRulesReader = (
  space: KVNamespace,
  onProblem: (problem: ReaderProblem) => void,
): FlagDefinitionCacheProvider => ({
  getFlagDefinitions: () =>
    space.get(SWITCH_RULES_KEY, 'json').then(
      (value: unknown) => readStored(value, onProblem),
      (cause: unknown) => {
        onProblem({ status: 'unreadable', cause })
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
      // greptile: no-mutation: the one cell the SDK's callback fills; the SDK
      // swallows what the callback throws or returns, so the caller reads the
      // cell once the SDK has finished.
      outcome = await acceptChecked(rules, write)
    },
    shutdown: () => {},
  }
  return { provider, outcome: (): WriterOutcome | undefined => outcome }
}
