import type { PostHogOptions } from 'posthog-node'
import type { FlagDefinitionCacheProvider } from 'posthog-node/experimental'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkSwitchRules,
  evaluateStoredSwitches,
  evaluateSwitches,
  NO_WALLET_VISITOR,
  type SwitchRules,
  switchVisitor,
} from './switchRules'
import {
  flagRule,
  forEveryone,
  forWallets,
  OTHER_WALLET,
  switchRules,
  TEST_WALLET,
} from './switchRules.mock'

type Cohort = SwitchRules['cohorts'][string]

// What each posthog-node client was given, in the order they were made, and
// each time one asked for the network through the `fetch` it was given.
const recorded = vi.hoisted(() => ({
  clientMade: vi.fn<(options: PostHogOptions | undefined) => void>(),
  networkAsked: vi.fn<(url: string) => void>(),
}))

vi.mock('posthog-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('posthog-node')>()
  return {
    ...actual,
    PostHog: class extends actual.PostHog {
      constructor(apiKey: string, options?: PostHogOptions) {
        const given = options?.fetch
        super(
          apiKey,
          given && {
            ...options,
            fetch: (url, init) => {
              recorded.networkAsked(url)
              return given(url, init)
            },
          },
        )
        recorded.clientMade(options)
      }
    },
  }
})

/** A provider that holds nothing and is not to fetch, as the Reader over an empty KV. */
const holdingNothing: FlagDefinitionCacheProvider = {
  getFlagDefinitions: () => undefined,
  shouldFetchFlagDefinitions: () => false,
  onFlagDefinitionsReceived: () => {},
  shutdown: () => {},
}

describe('evaluateSwitches', () => {
  beforeEach(() => {
    recorded.clientMade.mockClear()
    recorded.networkAsked.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decides every switch for a wallet from the rules alone, asking nothing of PostHog', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      evaluateSwitches(switchRules(), switchVisitor(TEST_WALLET)),
    ).resolves.toEqual({ migration: true, i18n: true, 'migration-nft': false })
    await expect(
      evaluateSwitches(switchRules(), switchVisitor(OTHER_WALLET)),
    ).resolves.toEqual({ migration: false, i18n: true, 'migration-nft': false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses the network posthog-node asks for when its provider holds no rules, and says it holds none', async () => {
    const evaluation = await evaluateStoredSwitches(
      holdingNothing,
      switchVisitor(TEST_WALLET),
    )

    expect(evaluation).toEqual({ answers: {}, hasRules: false })
    // An ordinary empty store, not a bug: the SDK falls back to its own
    // fetch, with a key, and the `fetch` it was given refuses.
    expect(recorded.networkAsked).toHaveBeenCalled()
    const askNetwork = recorded.clientMade.mock.calls
      .at(-1)?.[0]
      ?.fetch?.('http://switch-rules.invalid', { method: 'GET', headers: {} })
    await expect(askNetwork).rejects.toMatchObject({
      _tag: 'SwitchRulesNetworkRefused',
      message: 'Feature switches are decided from stored rules only',
    })
  })

  it('reads the rules a provider holds, and asks nothing of the network for them', async () => {
    const holding: FlagDefinitionCacheProvider = {
      ...holdingNothing,
      getFlagDefinitions: async () => switchRules(),
    }

    await expect(
      evaluateStoredSwitches(holding, switchVisitor(TEST_WALLET)),
    ).resolves.toEqual({
      answers: { migration: true, i18n: true, 'migration-nft': false },
      hasRules: true,
    })
    expect(recorded.networkAsked).not.toHaveBeenCalled()
  })

  it('logs nothing about experience continuity when the project has another flag that asks for it', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rules = switchRules({
      'unrelated-flag': flagRule('unrelated-flag', [forEveryone()], {
        ensure_experience_continuity: true,
      }),
    })

    await expect(
      evaluateSwitches(rules, switchVisitor(TEST_WALLET)),
    ).resolves.toEqual({ migration: true, i18n: true, 'migration-nft': false })
    await expect(
      evaluateSwitches(rules, switchVisitor(OTHER_WALLET)),
    ).resolves.toEqual({ migration: false, i18n: true, 'migration-nft': false })
    expect(warnings).not.toHaveBeenCalled()
  })

  it('matches a wallet whatever the case of its address', async () => {
    const answers = await evaluateSwitches(
      switchRules(),
      switchVisitor(`0x${TEST_WALLET.slice(2).toUpperCase()}`),
    )
    expect(answers.migration).toBe(true)
  })

  it('decides a visitor without a wallet: a rule aimed at wallets is off, one open to everyone is on', async () => {
    await expect(
      evaluateSwitches(switchRules(), NO_WALLET_VISITOR),
    ).resolves.toEqual({ migration: false, i18n: true, 'migration-nft': false })
  })

  it('gives every visitor without a wallet the same answer to a percentage rule', async () => {
    const half = switchRules({ i18n: flagRule('i18n', [forEveryone(50)]) })
    const answers = await Promise.all(
      Array.from({ length: 5 }, () =>
        evaluateSwitches(half, switchVisitor(null)),
      ),
    )
    expect(new Set(answers.map((answer) => answer.i18n)).size).toBe(1)
    expect(typeof answers[0]?.i18n).toBe('boolean')
  })

  it('leaves out a switch the rules cannot decide', async () => {
    const answers = await evaluateSwitches(
      switchRules({ migration: undefined }),
      switchVisitor(TEST_WALLET),
    )
    expect(answers).toEqual({ i18n: true, 'migration-nft': false })
  })
})

describe('checkSwitchRules', () => {
  it('passes rules that decide every switch for a wallet and for no wallet', async () => {
    await expect(checkSwitchRules(switchRules())).resolves.toEqual([])
  })

  it('names a switch missing from the rules', async () => {
    const problems = await checkSwitchRules(
      switchRules({ migration: undefined }),
    )
    expect(problems).toContain('migration: missing from the rules')
    expect(problems).toContain('migration: no yes or no for a wallet')
    expect(problems).toContain('migration: no yes or no for no wallet')
  })

  it('names every rule only PostHog could decide', async () => {
    const problems = await checkSwitchRules(
      switchRules({
        migration: flagRule('migration', [forWallets([TEST_WALLET])], {
          ensure_experience_continuity: true,
        }),
        i18n: flagRule('i18n', [
          {
            properties: [
              { key: 'id', type: 'cohort', operator: 'in', value: 42 },
            ],
            rollout_percentage: 100,
          },
        ]),
        'migration-nft': flagRule('migration-nft', [
          {
            properties: [
              {
                key: 'address',
                type: 'person',
                operator: 'is_not_set',
                value: 'is_not_set',
              },
            ],
            rollout_percentage: 100,
          },
        ]),
      }),
    )
    expect(problems).toEqual(
      expect.arrayContaining([
        'migration: persists across sign-in (experience continuity)',
        'i18n: uses cohort 42, which the rules do not hold',
        'migration-nft: uses the is_not_set operator',
      ]),
    )
  })

  it('names a property the server never supplies, though the two sample visitors never reach the condition that holds it', async () => {
    const rules = switchRules({
      migration: flagRule('migration', [
        {
          properties: [
            {
              key: 'address',
              type: 'person',
              operator: 'is_not',
              value: [TEST_WALLET.toLowerCase()],
            },
          ],
          rollout_percentage: 100,
        },
        {
          properties: [
            { key: 'country', type: 'person', operator: 'exact', value: 'DE' },
          ],
          rollout_percentage: 100,
        },
      ]),
    })
    // The wallet the first condition leaves out gets no answer, so every
    // switch is off for it, though the sample wallets are all decided.
    const excluded = await evaluateSwitches(rules, switchVisitor(TEST_WALLET))
    expect(excluded).not.toHaveProperty('migration')

    expect(await checkSwitchRules(rules)).toContain(
      'migration: uses the property country, which the server does not supply (it supplies address)',
    )
  })

  it('names a property inside a cohort, however deep, and a dependency on another flag', async () => {
    const countryCohort: Cohort = {
      type: 'OR',
      values: [
        {
          type: 'AND',
          values: [
            { key: 'country', type: 'person', operator: 'exact', value: 'DE' },
          ],
        },
      ],
    }
    const rules = {
      ...switchRules({
        i18n: flagRule('i18n', [
          {
            properties: [
              { key: 'id', type: 'cohort', operator: 'in', value: 7 },
            ],
            rollout_percentage: 100,
          },
        ]),
        'migration-nft': flagRule('migration-nft', [
          {
            properties: [
              {
                key: 'migration',
                type: 'flag',
                operator: 'flag_evaluates_to',
                value: true,
                dependency_chain: ['migration'],
              },
            ],
            rollout_percentage: 100,
          },
        ]),
      }),
      cohorts: { '7': countryCohort },
    }

    expect(await checkSwitchRules(rules)).toEqual(
      expect.arrayContaining([
        'i18n: uses the property country, which the server does not supply (it supplies address)',
        'migration-nft: depends on another flag, which the server does not evaluate',
      ]),
    )
  })

  it('passes cohorts that hold only the wallet address, nested or naming one another', async () => {
    const wallets: Cohort = {
      type: 'AND',
      values: [
        {
          key: 'address',
          type: 'person',
          operator: 'exact',
          value: [TEST_WALLET.toLowerCase()],
        },
        { key: 'id', type: 'cohort', operator: 'in', value: 2 },
      ],
    }
    const nested: Cohort = {
      type: 'OR',
      values: [
        {
          type: 'AND',
          values: [
            { key: 'id', type: 'cohort', operator: 'in', value: 1 },
            {
              key: 'address',
              type: 'person',
              operator: 'exact',
              value: [OTHER_WALLET.toLowerCase()],
            },
          ],
        },
      ],
    }
    const rules = {
      ...switchRules({
        i18n: flagRule('i18n', [
          {
            properties: [
              { key: 'id', type: 'cohort', operator: 'in', value: 1 },
            ],
            rollout_percentage: 100,
          },
          forEveryone(),
        ]),
      }),
      // The two cohorts name each other; the check ends at the second visit.
      cohorts: { '1': wallets, '2': nested },
    }

    expect(await checkSwitchRules(rules)).toEqual([])
  })

  it('names a switch aimed at any wallet with is_set, which a visitor without a wallet would match too', async () => {
    const anyWallet = switchRules({
      migration: flagRule('migration', [
        {
          properties: [
            {
              key: 'address',
              type: 'person',
              operator: 'is_set',
              value: 'is_set',
            },
          ],
          rollout_percentage: 100,
        },
      ]),
    })
    // The empty address of a visitor without a wallet counts as set.
    await expect(
      evaluateSwitches(anyWallet, NO_WALLET_VISITOR),
    ).resolves.toMatchObject({ migration: true })

    expect(await checkSwitchRules(anyWallet)).toContain(
      'migration: uses the is_set operator, which a visitor without a wallet answers yes to',
    )
  })

  it.each([
    ['a group type the rules do not hold', {}],
    ['a group type the rules hold', { '0': 'organization' }],
  ])('names a switch aimed at %s, since the server is given no groups', async (_label, groupTypeMapping) => {
    const problems = await checkSwitchRules({
      ...switchRules({
        i18n: flagRule('i18n', [forEveryone()], {
          filters: {
            aggregation_group_type_index: 0,
            groups: [forEveryone()],
          },
        }),
      }),
      groupTypeMapping,
    })
    expect(problems).toContain(
      'i18n: aims at a group, and the server is given no groups',
    )
  })

  it.each([
    'semver_gt',
    'is_date_before',
    'is_date_after',
    'a_new_operator',
  ])('names a condition on the address with the operator %s, which posthog-node cannot evaluate, though the two sample visitors never reach it', async (operator) => {
    const rules = switchRules({
      migration: flagRule('migration', [
        {
          properties: [
            {
              key: 'address',
              type: 'person',
              operator: 'is_not',
              value: [TEST_WALLET.toLowerCase()],
            },
          ],
          rollout_percentage: 100,
        },
        {
          properties: [
            { key: 'address', type: 'person', operator, value: '1.0.0' },
          ],
          rollout_percentage: 100,
        },
      ]),
    })
    // The wallet the first condition leaves out meets the second, which
    // posthog-node cannot decide, so every switch is off for it.
    const excluded = await evaluateSwitches(rules, switchVisitor(TEST_WALLET))
    expect(excluded).not.toHaveProperty('migration')

    expect(await checkSwitchRules(rules)).toContain(
      `migration: uses the operator ${operator}, which posthog-node cannot evaluate`,
    )
  })

  it.each([
    'exact',
    'is_not',
    'icontains',
    'not_icontains',
    'regex',
    'not_regex',
    'gt',
    'gte',
    'lt',
    'lte',
  ])('passes a condition on the address with the operator %s', async (operator) => {
    const rules = switchRules({
      migration: flagRule('migration', [
        {
          properties: [
            { key: 'address', type: 'person', operator, value: '0xabc' },
          ],
          rollout_percentage: 100,
        },
      ]),
    })

    expect(await checkSwitchRules(rules)).toEqual([])
  })

  it('refuses a cohort whose members are not objects, instead of reading them', async () => {
    const rules = {
      ...switchRules({
        i18n: flagRule('i18n', [
          {
            properties: [
              { key: 'id', type: 'cohort', operator: 'in', value: 9 },
            ],
            rollout_percentage: 100,
          },
        ]),
      }),
      cohorts: {
        '9': { type: 'OR', values: [null, 'text'] } as unknown as Cohort,
      },
    }

    expect(await checkSwitchRules(rules)).toContain(
      'i18n: holds a condition or a property that is not an object',
    )
  })

  it.each([
    'constructor',
    '__proto__',
    'toString',
  ])('does not take the cohort %s for one the rules hold, because Object has a member of that name', async (name) => {
    const rules = switchRules({
      i18n: flagRule('i18n', [
        {
          properties: [
            { key: 'id', type: 'cohort', operator: 'in', value: name },
          ],
          rollout_percentage: 100,
        },
      ]),
    })

    expect(await checkSwitchRules(rules)).toContain(
      `i18n: uses cohort ${name}, which the rules do not hold`,
    )
  })

  it('refuses a rule whose conditions or properties are not objects, instead of reading them', async () => {
    const problems = await checkSwitchRules(
      switchRules({
        i18n: flagRule('i18n', [null as never]),
        migration: flagRule('migration', [
          { properties: [null as never], rollout_percentage: 100 },
        ]),
      }),
    )
    expect(problems).toEqual(
      expect.arrayContaining([
        'i18n: holds a condition or a property that is not an object',
        'migration: holds a condition or a property that is not an object',
      ]),
    )
  })

  it('rejects empty rules', async () => {
    const problems = await checkSwitchRules({
      flags: [],
      groupTypeMapping: {},
      cohorts: {},
    })
    expect(problems.length).toBeGreaterThan(0)
  })
})
