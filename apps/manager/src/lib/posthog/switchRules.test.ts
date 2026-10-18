import type { PostHogOptions } from 'posthog-node'
import type { FlagDefinitionCacheProvider } from 'posthog-node/experimental'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkSwitchRules,
  evaluateStoredSwitches,
  evaluateSwitches,
  NO_WALLET_VISITOR,
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
