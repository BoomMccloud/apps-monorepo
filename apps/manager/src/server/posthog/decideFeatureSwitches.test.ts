import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SWITCHES_OFF } from '@/lib/posthog/feature-flags'
import type { SwitchRules } from './switchRules'
import {
  memoryKv,
  OTHER_WALLET,
  switchRules,
  TEST_WALLET,
} from './switchRules.mock'
import { SWITCH_RULES_KEY } from './switchRulesCache'

const SECRET_KEY = 'phs_secret_value'

const storedSpace = (rules: SwitchRules) =>
  memoryKv({ [SWITCH_RULES_KEY]: JSON.stringify(rules) })

// The module remembers what it has logged for the life of the Worker
// instance, so each test starts from a fresh copy of it.
const loadDecide = async () =>
  (await import('./decideFeatureSwitches')).decideFeatureSwitches

describe('decideFeatureSwitches', () => {
  // What the request path may never reach for: the network, by any route.
  const network = vi.fn(async (..._args: Parameters<typeof fetch>) => {
    throw new Error('no network in this test')
  })

  beforeEach(() => {
    vi.resetModules()
    network.mockClear()
    vi.stubGlobal('fetch', network)
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.doUnmock('./switchRules')
  })

  it('decides from the stored rules, asking nothing of the network', async () => {
    const decide = await loadDecide()
    const { space } = storedSpace(switchRules())
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET)).resolves.toEqual({
      migration: true,
      i18n: true,
      'migration-nft': false,
    })
    await expect(decide(env, OTHER_WALLET)).resolves.toEqual({
      migration: false,
      i18n: true,
      'migration-nft': false,
    })
    await expect(decide(env, null)).resolves.toEqual({
      migration: false,
      i18n: true,
      'migration-nft': false,
    })
    expect(network).not.toHaveBeenCalled()
  })

  it('before the refresh has stored any rules, answers every switch off, says why once per instance, and asks nothing of the network', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space, contents } = memoryKv()
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(decide(env, null)).resolves.toEqual(ALL_SWITCHES_OFF)

    // posthog-node asks to fetch whenever it is handed no rules, which only
    // the refusing `fetch` it is given keeps from the network.
    expect(network).not.toHaveBeenCalled()
    expect(contents().size).toBe(0)
    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message:
        'no switch rules are stored, so every switch is off until the scheduled refresh stores them',
    })
  })

  it('answers every switch off, and logs it once per instance, when deciding fails in any way', async () => {
    vi.doMock('./switchRules', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./switchRules')>()),
      evaluateStoredSwitches: vi
        .fn()
        .mockRejectedValue(new Error('the client failed')),
    }))
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = storedSpace(switchRules())
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(decide(env, null)).resolves.toEqual(ALL_SWITCHES_OFF)

    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: 'deciding the switches failed',
    })
  })

  it('answers every switch off, and logs that once per instance, when the stored rules cannot be read', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Only `get` is read; the rest of the binding is not modelled.
    const unreadable = {
      get: async () => {
        throw new Error('KV is unavailable')
      },
    } as unknown as KVNamespace
    const env = {
      POSTHOG_SWITCH_RULES: unreadable,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(decide(env, null)).resolves.toEqual(ALL_SWITCHES_OFF)

    expect(network).not.toHaveBeenCalled()
    const logged = errors.mock.calls.map(([error]) => error)
    expect(logged).toContainEqual(
      expect.objectContaining({
        _tag: 'StoredSwitchRulesUnreadable',
        message:
          'the stored switch rules could not be read, so every switch is off until they can',
      }),
    )
    expect(
      logged.filter((error) => error._tag === 'StoredSwitchRulesUnreadable'),
    ).toHaveLength(1)
  })

  it('answers every switch off, and logs what is stored once per instance, when the stored value is not switch rules', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = memoryKv({
      [SWITCH_RULES_KEY]: '{"rules":{"flags":[]},"etag":null}',
    })
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(decide(env, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(decide(env, null)).resolves.toEqual(ALL_SWITCHES_OFF)

    expect(network).not.toHaveBeenCalled()
    const logged = errors.mock.calls.map(([error]) => error)
    expect(logged).toContainEqual(
      expect.objectContaining({
        _tag: 'StoredSwitchRulesUnrecognized',
        message:
          'the value stored for the switch rules is an object with the keys etag, rules, not switch rules, so every switch is off until the scheduled refresh stores them',
      }),
    )
    expect(
      logged.filter((error) => error._tag === 'StoredSwitchRulesUnrecognized'),
    ).toHaveLength(1)
  })

  it('answers every switch off without a space bound for the rules, and logs why once per instance', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(decide({}, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)
    await expect(decide({}, TEST_WALLET)).resolves.toEqual(ALL_SWITCHES_OFF)

    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: 'no switch rules space is bound',
    })
  })

  it('answers every switch off when the rules leave one undecided, and names it', async () => {
    const decide = await loadDecide()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { space } = storedSpace(switchRules({ 'migration-nft': undefined }))

    await expect(
      decide({ POSTHOG_SWITCH_RULES: space }, TEST_WALLET),
    ).resolves.toEqual(ALL_SWITCHES_OFF)
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      _tag: 'FeatureSwitchesUndecided',
      message: 'the rules decide no yes or no for migration-nft',
    })
  })

  it('needs no key: a request only reads what the refresh stored', async () => {
    const decide = await loadDecide()
    const { space } = storedSpace(switchRules())

    await expect(
      decide({ POSTHOG_SWITCH_RULES: space }, TEST_WALLET),
    ).resolves.toMatchObject({ migration: true })
  })
})
