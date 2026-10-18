import { PostHog } from 'posthog-node'
import type {
  FlagDefinitionCacheData,
  FlagDefinitionCacheProvider,
} from 'posthog-node/experimental'
import type { Address } from 'viem'
// By path, not by package name: vite.config.ts loads this module through the
// build check before any workspace package can be resolved.
import { isRecord } from '../../../../../packages/utils/src/isRecord'
import { TaggedError } from '../../../../../packages/utils/src/neverthrow'
import { FEATURE_SWITCH_NAMES, type FeatureSwitchName } from './feature-flags'

/**
 * PostHog's rules for the project's feature switches, as its local-evaluation
 * download gives them. The Manager's server decides every switch from these
 * alone, so the browser never asks PostHog and PostHog never learns which
 * wallet asked.
 */
export type SwitchRules = FlagDefinitionCacheData

/** Who the switches are decided for. */
type SwitchVisitor = {
  readonly distinctId: string
  /** Empty for a visitor without a wallet, which posthog-node counts as set. */
  readonly address: Address | ''
}

/**
 * Every visitor without a wallet is decided alike: a rule aimed at named
 * wallets is off for them, a rule open to everyone is on, and a percentage
 * rule gives all of them the same answer.
 */
export const NO_WALLET_VISITOR: SwitchVisitor = {
  distinctId: 'visitor-without-wallet',
  address: '',
}

export const switchVisitor = (wallet: Address | null): SwitchVisitor =>
  wallet ? { distinctId: wallet, address: wallet } : NO_WALLET_VISITOR

/** A wallet the rules check decides every switch for, besides no wallet. */
const SAMPLE_WALLET = '0x000000000000000000000000000000000000dEaD'

type FlagRule = SwitchRules['flags'][number]

const propertiesOf = (rule: FlagRule) =>
  (rule.filters?.groups ?? []).flatMap((group) => group.properties ?? [])

/** What in a switch's own rule PostHog alone could decide. */
const ruleProblems = (
  rules: SwitchRules,
  name: FeatureSwitchName,
): readonly string[] => {
  const rule = rules.flags.find((flag) => flag.key === name)
  if (!rule) return [`${name}: missing from the rules`]
  // PostHog's download holds objects; rules that do not are refused, not read.
  if (
    !(rule.filters?.groups ?? []).every(isRecord) ||
    !propertiesOf(rule).every(isRecord)
  ) {
    return [`${name}: holds a condition or a property that is not an object`]
  }
  const groupTypeIndex = rule.filters?.aggregation_group_type_index
  return [
    ...(rule.ensure_experience_continuity
      ? [`${name}: persists across sign-in (experience continuity)`]
      : []),
    // The server is given no groups, so a switch aimed at a group is off for
    // everyone without a word, whether or not the rules hold that group type.
    ...(typeof groupTypeIndex === 'number'
      ? [`${name}: aims at a group, and the server is given no groups`]
      : []),
    ...propertiesOf(rule).flatMap((property) => [
      ...(property.operator === 'is_not_set'
        ? [`${name}: uses the is_not_set operator`]
        : []),
      // A visitor without a wallet is decided with an empty address, which
      // posthog-node counts as set.
      ...(property.operator === 'is_set'
        ? [
            `${name}: uses the is_set operator, which a visitor without a wallet answers yes to`,
          ]
        : []),
      ...(property.type === 'cohort' &&
      !(String(property.value) in rules.cohorts)
        ? [
            `${name}: uses cohort ${String(property.value)}, which the rules do not hold`,
          ]
        : []),
    ]),
  ]
}

/**
 * Hands the client the rules it was given, as the Reader hands it the stored
 * ones. The rules check decides every switch from rules it holds this way.
 */
const heldRules = (rules: SwitchRules): FlagDefinitionCacheProvider => ({
  getFlagDefinitions: () => rules,
  shouldFetchFlagDefinitions: () => false,
  onFlagDefinitionsReceived: () => {},
  shutdown: () => {},
})

/** What posthog-node meets when it asks for the network, which a request is never given. */
class SwitchRulesNetworkRefused extends TaggedError(
  'SwitchRulesNetworkRefused',
)<{ readonly message: string }> {}

/**
 * posthog-node asks for the network whenever its cache provider holds nothing
 * (a store not yet filled, or one it cannot read): it falls back to its own
 * fetch for the rules, which in PostHog's example carries the real key and
 * brings back rules that no check has seen. That is reachable by an ordinary
 * empty store, so a request refuses it, whatever host its client is given,
 * and does not assert it.
 */
const refuseNetwork = (): Promise<never> =>
  Promise.reject(
    new SwitchRulesNetworkRefused({
      message: 'Feature switches are decided from stored rules only',
    }),
  )

/** Long enough that a client never polls within the one use it is made for. */
export const NO_POLLING_MS = 60 * 60 * 1000

/** The switches the rules decided; one they could not decide is absent. */
type SwitchAnswers = Readonly<Partial<Record<FeatureSwitchName, boolean>>>

/** What the rules decided for one visitor, and whether the provider held any rules at all. */
type SwitchEvaluation = {
  readonly answers: SwitchAnswers
  readonly hasRules: boolean
}

/**
 * A client that reads its rules from `provider` and decides locally, as the
 * request handler of PostHog's Cloudflare KV example does. The SDK is given a
 * key only because it builds its rules reader for a client that has one; it
 * is never used, since `fetch` refuses and every read is local.
 */
const evaluate = async (
  provider: FlagDefinitionCacheProvider,
  visitor: SwitchVisitor,
): Promise<SwitchEvaluation> => {
  const client = new PostHog('switch-rules', {
    host: 'http://switch-rules.invalid',
    personalApiKey: 'switch-rules',
    enableLocalEvaluation: true,
    flagDefinitionCacheProvider: provider,
    featureFlagsPollingInterval: NO_POLLING_MS,
    fetch: refuseNetwork,
  })
  try {
    const flags = await client.getAllFlags(visitor.distinctId, {
      personProperties: { address: visitor.address },
      onlyEvaluateLocally: true,
      flagKeys: [...FEATURE_SWITCH_NAMES],
    })
    return {
      answers: Object.fromEntries(
        FEATURE_SWITCH_NAMES.flatMap((name) => {
          const value = flags[name]
          return typeof value === 'boolean' ? [[name, value]] : []
        }),
      ),
      hasRules: client.isLocalEvaluationReady(),
    }
  } finally {
    await client.shutdown()
  }
}

/**
 * Decide each switch for one visitor from rules in hand. Nothing is ever
 * asked of PostHog, and no record of the read is sent.
 */
export const evaluateSwitches = async (
  rules: SwitchRules,
  visitor: SwitchVisitor,
): Promise<SwitchAnswers> => (await evaluate(heldRules(rules), visitor)).answers

/** The same, for the rules a provider holds: the stored ones, read for a request. */
export const evaluateStoredSwitches = evaluate

/**
 * The rules check: every switch the Manager reads is in the rules, depends on
 * nothing PostHog alone holds, and gets a yes or a no both for a wallet and
 * for a visitor with none. Returns what is wrong; empty means the rules can
 * serve every visitor. The deploy, the scheduled refresh and the tests run it.
 */
export const checkSwitchRules = async (
  rules: SwitchRules,
): Promise<readonly string[]> => {
  const structural = FEATURE_SWITCH_NAMES.flatMap((name) =>
    ruleProblems(rules, name),
  )
  const visitors = [
    { label: 'a wallet', visitor: switchVisitor(SAMPLE_WALLET) },
    { label: 'no wallet', visitor: NO_WALLET_VISITOR },
  ] as const
  const undecided = await Promise.all(
    visitors.map(async ({ label, visitor }) => {
      const answers = await evaluateSwitches(rules, visitor)
      return FEATURE_SWITCH_NAMES.filter(
        (name) => answers[name] === undefined,
      ).map((name) => `${name}: no yes or no for ${label}`)
    }),
  )
  return [...structural, ...undecided.flat()]
}
