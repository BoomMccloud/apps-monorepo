import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSwitchRules } from './refreshSwitchRules'
import type { SwitchRules } from './switchRules'
import { memoryKv, switchRules } from './switchRules.mock'
import { SWITCH_RULES_KEY } from './switchRulesStore'

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

describe('refreshSwitchRules', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('stores rules that pass the check, with their ETag', async () => {
    const { space, contents } = memoryKv()
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(
      refreshSwitchRules(env, {
        fetchRules: answering(() => rulesResponse(switchRules(), '"v1"')),
      }),
    ).resolves.toBe('stored')
    expect(storedValue(contents())).toEqual({
      rules: switchRules(),
      etag: '"v1"',
    })
  })

  it('replaces a stored value it cannot read, downloading the rules whole', async () => {
    const { space, contents } = memoryKv({ [SWITCH_RULES_KEY]: 'not json' })
    const fetchRules = vi.fn(
      answering(() => rulesResponse(switchRules(), '"v2"')),
    )
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }

    await expect(refreshSwitchRules(env, { fetchRules })).resolves.toBe(
      'stored',
    )
    const headers = new Headers(fetchRules.mock.calls[0]?.[1]?.headers)
    expect(headers.has('If-None-Match')).toBe(false)
    expect(storedValue(contents())).toMatchObject({ etag: '"v2"' })
  })

  it('asks with the stored ETag and keeps the stored rules when they are unchanged', async () => {
    const { space, contents } = memoryKv()
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }
    await refreshSwitchRules(env, {
      fetchRules: answering(() => rulesResponse(switchRules(), '"v1"')),
    })
    const before = contents().get(SWITCH_RULES_KEY)
    const fetchRules = vi.fn(
      answering(() => new Response(null, { status: 304 })),
    )

    await expect(refreshSwitchRules(env, { fetchRules })).resolves.toBe(
      'unchanged',
    )
    expect(fetchRules.mock.calls[0]?.[1]?.headers).toMatchObject({
      'If-None-Match': '"v1"',
    })
    expect(contents().get(SWITCH_RULES_KEY)).toBe(before)
  })

  it('throws on rules that fail the check and leaves the last good rules in place', async () => {
    const { space, contents } = memoryKv()
    const env = {
      POSTHOG_SWITCH_RULES: space,
      POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
    }
    await refreshSwitchRules(env, {
      fetchRules: answering(() => rulesResponse(switchRules(), '"v1"')),
    })
    const lastGood = contents().get(SWITCH_RULES_KEY)

    await expect(
      refreshSwitchRules(env, {
        fetchRules: answering(() =>
          rulesResponse(switchRules({ migration: undefined }), '"v2"'),
        ),
      }),
    ).rejects.toMatchObject({
      _tag: 'SwitchRulesRefreshFailed',
      message: expect.stringContaining('migration: missing from the rules'),
    })
    expect(contents().get(SWITCH_RULES_KEY)).toBe(lastGood)
  })

  it('throws when the download fails, and stores nothing', async () => {
    const { space, contents } = memoryKv()

    await expect(
      refreshSwitchRules(
        {
          POSTHOG_SWITCH_RULES: space,
          POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
        },
        { fetchRules: answering(() => new Response('', { status: 403 })) },
      ),
    ).rejects.toMatchObject({ message: 'the download answered 403' })
    expect(contents().size).toBe(0)
  })

  it('throws when the key or the space is missing', async () => {
    const { space } = memoryKv()
    await expect(
      refreshSwitchRules({ POSTHOG_SWITCH_RULES: space }),
    ).rejects.toMatchObject({ _tag: 'SwitchRulesRefreshFailed' })
    await expect(
      refreshSwitchRules({ POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY }),
    ).rejects.toMatchObject({ _tag: 'SwitchRulesRefreshFailed' })
  })
})
