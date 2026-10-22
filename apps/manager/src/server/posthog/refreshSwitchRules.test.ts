import { err, ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSwitchRules } from './refreshSwitchRules'
import type { SwitchRules } from './switchRules'
import { memoryKv, switchRules } from './switchRules.mock'
import { SWITCH_RULES_KEY } from './switchRulesCache'

const SECRET_KEY = 'phs_secret_value'

const answering =
  (response: () => Response) =>
  async (..._args: Parameters<typeof fetch>): Promise<Response> =>
    response()

const rulesResponse = (rules: SwitchRules, etag: string) =>
  Response.json(
    {
      flags: rules.flags,
      group_type_mapping: rules.groupTypeMapping,
      cohorts: rules.cohorts,
    },
    { headers: { ETag: etag } },
  )

const storedValue = (contents: ReadonlyMap<string, string>) => {
  const value = contents.get(SWITCH_RULES_KEY)
  return value === undefined ? undefined : JSON.parse(value)
}

const envWith = (space: KVNamespace) => ({
  POSTHOG_SWITCH_RULES: space,
  POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
})

describe('refreshSwitchRules', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("stores the rules PostHog's SDK fetched, as it hands them over, once they pass the check", async () => {
    const { space, contents } = memoryKv()
    const fetchRules = vi.fn(
      answering(() => rulesResponse(switchRules(), '"v1"')),
    )

    await expect(
      refreshSwitchRules(envWith(space), { fetchRules }),
    ).resolves.toEqual(ok('stored'))

    expect(storedValue(contents())).toEqual(switchRules())
    expect(fetchRules).toHaveBeenCalledOnce()
    const [url, init] = fetchRules.mock.calls[0] ?? []
    expect(url).toBe(
      'https://posthog.example/api/feature_flag/local_evaluation?token=phc_project&send_cohorts',
    )
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SECRET_KEY}`,
    })
  })

  it('fetches the rules whole on every run and stores them again, however little changed', async () => {
    const { space, contents } = memoryKv()
    const fetchRules = vi.fn(
      answering(() => rulesResponse(switchRules(), '"v1"')),
    )
    await refreshSwitchRules(envWith(space), { fetchRules })
    const before = contents().get(SWITCH_RULES_KEY)

    await expect(
      refreshSwitchRules(envWith(space), { fetchRules }),
    ).resolves.toEqual(ok('stored'))

    expect(fetchRules).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchRules.mock.calls) {
      expect(init?.headers).not.toHaveProperty('If-None-Match')
    }
    expect(contents().get(SWITCH_RULES_KEY)).toBe(before)
  })

  it('replaces whatever is stored, even a value that is not JSON', async () => {
    const { space, contents } = memoryKv({ [SWITCH_RULES_KEY]: 'not json' })

    await expect(
      refreshSwitchRules(envWith(space), {
        fetchRules: answering(() => rulesResponse(switchRules(), '"v2"')),
      }),
    ).resolves.toEqual(ok('stored'))

    expect(storedValue(contents())).toEqual(switchRules())
  })

  it('returns the failure for rules that fail the check and leaves the last good rules in place', async () => {
    const { space, contents } = memoryKv()
    await refreshSwitchRules(envWith(space), {
      fetchRules: answering(() => rulesResponse(switchRules(), '"v1"')),
    })
    const lastGood = contents().get(SWITCH_RULES_KEY)

    await expect(
      refreshSwitchRules(envWith(space), {
        fetchRules: answering(() =>
          rulesResponse(switchRules({ migration: undefined }), '"v2"'),
        ),
      }),
    ).resolves.toEqual(
      err(
        expect.objectContaining({
          _tag: 'SwitchRulesRefreshFailed',
          message: expect.stringContaining('migration: missing from the rules'),
        }),
      ),
    )
    expect(contents().get(SWITCH_RULES_KEY)).toBe(lastGood)
  })

  it('returns the failure when PostHog refuses the key, with what the SDK says, and stores nothing', async () => {
    const { space, contents } = memoryKv()

    const refreshed = await refreshSwitchRules(envWith(space), {
      fetchRules: answering(() => new Response('', { status: 403 })),
      timeoutMs: 100,
    })

    expect(refreshed).toEqual(
      err(
        expect.objectContaining({
          _tag: 'SwitchRulesRefreshFailed',
          message: expect.stringContaining(
            'PostHog sent no switch rules: ClientError: Your personal API key does not have permission',
          ),
        }),
      ),
    )
    expect(contents().size).toBe(0)
  })

  it.each([
    [
      'answers with a server error',
      () => answering(() => new Response('', { status: 503 })),
    ],
    [
      'cannot be reached',
      () => async () => {
        throw new Error('Network connection lost')
      },
    ],
  ])('returns the failure when PostHog %s, and stores nothing', async (_case, makeFetch) => {
    const { space, contents } = memoryKv()

    await expect(
      refreshSwitchRules(envWith(space), {
        fetchRules: makeFetch(),
        timeoutMs: 100,
      }),
    ).resolves.toEqual(
      err(
        expect.objectContaining({
          _tag: 'SwitchRulesRefreshFailed',
          message: 'PostHog sent no switch rules',
        }),
      ),
    )
    expect(contents().size).toBe(0)
  })

  it('returns the failure when the checked rules cannot be written to KV', async () => {
    const failure = new Error('KV is unavailable')
    // Only `put` is used; the rest of the binding is not modelled.
    const unwritable = {
      put: async () => {
        throw failure
      },
    } as unknown as KVNamespace

    const refreshed = await refreshSwitchRules(envWith(unwritable), {
      fetchRules: answering(() => rulesResponse(switchRules(), '"v1"')),
    })

    expect(refreshed).toEqual(
      err(
        expect.objectContaining({
          _tag: 'SwitchRulesRefreshFailed',
          message:
            'the new rules pass the rules check and could not be written to KV',
          cause: failure,
        }),
      ),
    )
  })

  it('returns the failure when the key or the space is missing', async () => {
    const { space } = memoryKv()
    await expect(
      refreshSwitchRules({ POSTHOG_SWITCH_RULES: space }),
    ).resolves.toEqual(
      err(expect.objectContaining({ _tag: 'SwitchRulesRefreshFailed' })),
    )
    await expect(
      refreshSwitchRules({ POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY }),
    ).resolves.toEqual(
      err(expect.objectContaining({ _tag: 'SwitchRulesRefreshFailed' })),
    )
  })

  it('never names the secret key in a failure', async () => {
    const { space } = memoryKv()

    const refreshed = await refreshSwitchRules(envWith(space), {
      fetchRules: answering(() => new Response('', { status: 403 })),
      timeoutMs: 100,
    })

    expect(JSON.stringify(refreshed)).not.toContain(SECRET_KEY)
  })
})
