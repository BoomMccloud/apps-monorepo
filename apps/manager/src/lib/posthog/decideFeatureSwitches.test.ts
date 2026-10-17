import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SWITCHES_OFF } from './feature-flags'
import type { SwitchRules } from './switchRules'
import {
  flagRule,
  memoryKv,
  OTHER_WALLET,
  switchRules,
  TEST_WALLET,
} from './switchRules.mock'
import { SWITCH_RULES_KEY } from './switchRulesStore'

const SECRET_KEY = 'phs_secret_value'

const storedSpace = (rules: SwitchRules) =>
  memoryKv({
    [SWITCH_RULES_KEY]: JSON.stringify({
      rules,
      etag: '"v1"',
    }),
  })

const downloadAnswering = (rules: SwitchRules) =>
  vi.fn(async (..._args: Parameters<typeof fetch>) =>
    Response.json({
      flags: rules.flags,
      group_type_mapping: rules.groupTypeMapping,
      cohorts: rules.cohorts,
    }),
  )

// The module remembers what it has logged for the life of the Worker
// instance, so each test starts from a fresh copy of it.
const loadDecide = async () =>
  (await import('./decideFeatureSwitches')).decideFeatureSwitches

describe('decideFeatureSwitches', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('decides from the stored rules, downloading nothing', async () => {
    const decide = await loadDecide()
    const { space } = storedSpace(switchRules())
    const fetchRules = vi.fn()
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET, { fetchRules })).resolves.toEqual({
      migration: true,
      i18n: true,
      'migration-nft': false,
    })
    await expect(decide(env, OTHER_WALLET, { fetchRules })).resolves.toEqual({
      migration: false,
      i18n: true,
      'migration-nft': false,
    })
    await expect(decide(env, null, { fetchRules })).resolves.toEqual({
      migration: false,
      i18n: true,
      'migration-nft': false,
    })
    expect(fetchRules).not.toHaveBeenCalled()
  })

  it('before the refresh has stored any rules, downloads its own for the request and stores nothing', async () => {
    const decide = await loadDecide()
    const { space, contents } = memoryKv()
    const fetchRules = downloadAnswering(switchRules())

    await expect(
      decide(
        {
          POSTHOG_SWITCH_RULES: space,
          POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
        },
        TEST_WALLET,
        { fetchRules },
      ),
    ).resolves.toMatchObject({ migration: true })
    expect(fetchRules).toHaveBeenCalledOnce()
    // The download carries the keys and nothing about the wallet.
    expect(String(fetchRules.mock.calls[0]?.[0])).not.toContain(
      TEST_WALLET.slice(2),
    )
    expect(contents().size).toBe(0)
  })

  it('answers every switch off when the rules it downloads for the request fail the rules check, as the refresh would not store them', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = memoryKv()
    // A rule aimed at any wallet with is_set, which a visitor without a wallet
    // would match too.
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

    await expect(
      decide(
        {
          POSTHOG_SWITCH_RULES: space,
          POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
        },
        null,
        { fetchRules: downloadAnswering(anyWallet) },
      ),
    ).resolves.toEqual(ALL_SWITCHES_OFF)
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: expect.stringContaining(
        'the downloaded rules fail the rules check: migration: uses the is_set operator',
      ),
    })
  })

  it('decides from its own download when the stored rules cannot be read, and logs that once per instance', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Only `get` is read; the rest of the binding is not modelled.
    const unreadable = {
      get: async () => {
        throw new Error('KV is unavailable')
      },
    } as unknown as KVNamespace
    const fetchRules = downloadAnswering(switchRules())
    const env = {
      POSTHOG_SWITCH_RULES: unreadable,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET, { fetchRules })).resolves.toEqual({
      migration: true,
      i18n: true,
      'migration-nft': false,
    })
    await expect(decide(env, null, { fetchRules })).resolves.toMatchObject({
      migration: false,
    })

    expect(fetchRules).toHaveBeenCalledTimes(2)
    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'StoredSwitchRulesUnreadable',
      message:
        'the stored switch rules could not be read, so each request downloads its own',
    })
  })

  it('answers every switch off without rules or a key, and logs why once per instance', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = memoryKv()

    await expect(
      decide({ POSTHOG_SWITCH_RULES: space }, TEST_WALLET),
    ).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(
      decide({ POSTHOG_SWITCH_RULES: space }, TEST_WALLET),
    ).resolves.toEqual(ALL_SWITCHES_OFF)

    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: 'no rules are stored and no project secret key is set',
    })
  })

  it('answers every switch off when the rules leave one undecided, and names it', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = storedSpace(switchRules({ 'migration-nft': undefined }))

    await expect(
      decide(
        {
          POSTHOG_SWITCH_RULES: space,
          POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
        },
        TEST_WALLET,
      ),
    ).resolves.toEqual(ALL_SWITCHES_OFF)
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: 'the rules decide no yes or no for migration-nft',
    })
  })

  it('answers every switch off when the fallback download fails, without naming the key', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = memoryKv()
    const fetchRules = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response('', { status: 401 }),
    )

    await expect(
      decide(
        {
          POSTHOG_SWITCH_RULES: space,
          POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
        },
        TEST_WALLET,
        { fetchRules },
      ),
    ).resolves.toEqual(ALL_SWITCHES_OFF)
    expect(JSON.stringify(errors.mock.calls)).not.toContain(SECRET_KEY)
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      message: 'no rules are stored and the download answered 401',
    })
  })
})
