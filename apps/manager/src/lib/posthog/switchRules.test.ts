import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkSwitchRules,
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

describe('evaluateSwitches', () => {
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

  it('matches a wallet whatever the case of its address', async () => {
    const answers = await evaluateSwitches(
      switchRules(),
      switchVisitor(TEST_WALLET.toUpperCase().replace('0X', '0x')),
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

  it('names a switch aimed at a group type the rules do not hold', async () => {
    const problems = await checkSwitchRules(
      switchRules({
        i18n: flagRule('i18n', [forEveryone()], {
          filters: {
            aggregation_group_type_index: 0,
            groups: [forEveryone()],
          },
        }),
      }),
    )
    expect(problems).toContain(
      'i18n: aims at a group type the rules do not hold',
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
