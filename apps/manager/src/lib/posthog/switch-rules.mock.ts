import type { SwitchRules } from './switch-rules'

/** Test fixtures: switch rules in the shape PostHog's download gives them. */

export const TEST_WALLET = '0x1111111111111111111111111111111111111111'
export const OTHER_WALLET = '0x2222222222222222222222222222222222222222'

type FlagRule = SwitchRules['flags'][number]
type Condition = NonNullable<NonNullable<FlagRule['filters']>['groups']>[number]

export const flagRule = (
  key: string,
  conditions: Condition[],
  extra: Partial<FlagRule> = {},
): FlagRule => ({
  id: key.length,
  name: key,
  key,
  active: true,
  deleted: false,
  rollout_percentage: null,
  ensure_experience_continuity: false,
  experiment_set: [],
  filters: { groups: conditions },
  ...extra,
})

export const forWallets = (wallets: readonly string[]): Condition => ({
  properties: [
    {
      key: 'address',
      type: 'person',
      operator: 'exact',
      value: wallets.map((wallet) => wallet.toLowerCase()),
    },
  ],
  rollout_percentage: 100,
})

export const forEveryone = (rolloutPercentage = 100): Condition => ({
  properties: [],
  rollout_percentage: rolloutPercentage,
})

/** The Manager's three switches: migration for one wallet, i18n for everyone, the NFT for no one. */
export const switchRules = (
  overrides: Partial<Record<string, FlagRule>> = {},
): SwitchRules => {
  const flags = {
    migration: flagRule('migration', [forWallets([TEST_WALLET])]),
    i18n: flagRule('i18n', [forEveryone()]),
    'migration-nft': flagRule('migration-nft', [forEveryone(0)]),
    ...overrides,
  }
  return {
    flags: Object.values(flags).filter(
      (flag): flag is FlagRule => flag !== undefined,
    ),
    groupTypeMapping: {},
    cohorts: {},
  }
}

/** A Workers KV space held in memory. */
export const memoryKv = (initial: Readonly<Record<string, string>> = {}) => {
  const values = new Map(Object.entries(initial))
  const space = {
    get: async (key: string, type?: string) => {
      const value = values.get(key)
      if (value === undefined) return null
      return type === 'json' ? JSON.parse(value) : value
    },
    put: async (key: string, value: string) => {
      values.set(key, value)
    },
  }
  // Only `get` and `put` are used; the rest of the binding is not modelled.
  return { space: space as unknown as KVNamespace, values }
}
