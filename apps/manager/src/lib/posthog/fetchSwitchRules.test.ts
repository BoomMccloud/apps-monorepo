import type {
  FlagDefinitionCacheData,
  FlagDefinitionCacheProvider,
} from 'posthog-node/experimental'
import { describe, expect, it, vi } from 'vitest'
import { fetchSwitchRules } from './fetchSwitchRules'
import { switchRules } from './switchRules.mock'

const SECRET_KEY = 'phs_secret_value'
const SOURCE = {
  host: 'https://posthog.example',
  projectKey: 'phc_project',
  secretKey: SECRET_KEY,
}

const answering =
  (response: () => Response) =>
  async (..._args: Parameters<typeof fetch>): Promise<Response> =>
    response()

const rulesResponse = () => {
  const rules = switchRules()
  return Response.json(
    {
      flags: rules.flags,
      group_type_mapping: rules.groupTypeMapping,
      cohorts: rules.cohorts,
    },
    { headers: { ETag: '"v1"' } },
  )
}

/**
 * A provider that fetches and keeps what it is handed, after a pause: `handed`
 * records the rules it was given and `done` that it finished with them.
 */
const recordingProvider = (pauseMs = 0) => {
  const handed = vi.fn<(rules: FlagDefinitionCacheData) => void>()
  const done = vi.fn<() => void>()
  const provider: FlagDefinitionCacheProvider = {
    getFlagDefinitions: () => undefined,
    shouldFetchFlagDefinitions: () => true,
    onFlagDefinitionsReceived: async (rules) => {
      handed(rules)
      await new Promise((resolve) => setTimeout(resolve, pauseMs))
      done()
    },
    shutdown: () => {},
  }
  return { provider, handed, done }
}

/** When a recorder was first called, counted across all of vitest's mocks; NaN when it never was. */
const calledAt = (recorder: {
  readonly mock: { readonly invocationCallOrder: readonly number[] }
}): number => recorder.mock.invocationCallOrder[0] ?? Number.NaN

describe('fetchSwitchRules', () => {
  it('has the SDK hand the provider the rules, and waits for the provider to finish with them', async () => {
    const { provider, handed, done } = recordingProvider(30)
    const resolved = vi.fn<() => void>()

    const fetched = await fetchSwitchRules(SOURCE, provider, {
      fetchRules: answering(rulesResponse),
    })
    resolved()

    expect(fetched.isOk()).toBe(true)
    expect(handed.mock.calls[0]?.[0].flags).toHaveLength(3)
    expect(calledAt(handed)).toBeLessThan(calledAt(done))
    expect(calledAt(done)).toBeLessThan(calledAt(resolved))
  })

  it('asks as the SDK asks, once, with the keys and nothing about a visitor', async () => {
    const fetchRules = vi.fn(answering(rulesResponse))

    await fetchSwitchRules(SOURCE, recordingProvider().provider, { fetchRules })

    expect(fetchRules).toHaveBeenCalledOnce()
    const [url, init] = fetchRules.mock.calls[0] ?? []
    expect(url).toBe(
      'https://posthog.example/api/feature_flag/local_evaluation?token=phc_project&send_cohorts',
    )
    expect(init?.method).toBe('GET')
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SECRET_KEY}`,
    })
    expect(JSON.stringify(fetchRules.mock.calls[0])).not.toMatch(
      /0x[0-9a-f]{40}/i,
    )
  })

  it('fetches the rules whole on every call, since a client made for one run holds no ETag to ask with', async () => {
    const fetchRules = vi.fn(answering(rulesResponse))

    await fetchSwitchRules(SOURCE, recordingProvider().provider, { fetchRules })
    await fetchSwitchRules(SOURCE, recordingProvider().provider, { fetchRules })

    expect(fetchRules).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchRules.mock.calls) {
      expect(init?.headers).not.toHaveProperty('If-None-Match')
    }
  })

  it('says what the SDK says when PostHog refuses the key', async () => {
    const { provider, handed, done } = recordingProvider()

    const fetched = await fetchSwitchRules(SOURCE, provider, {
      fetchRules: answering(() => new Response('', { status: 403 })),
      timeoutMs: 100,
    })

    expect(fetched.isErr() && fetched.error).toMatchObject({
      _tag: 'SwitchRulesNotFetched',
      message: expect.stringContaining(
        'PostHog sent no switch rules: ClientError: Your personal API key does not have permission',
      ),
    })
    expect(handed).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
  })

  it.each([
    [
      'PostHog answers with a server error',
      () => new Response('', { status: 500 }),
    ],
    [
      'PostHog answers that the quota is used',
      () => new Response('', { status: 402 }),
    ],
  ])('says PostHog sent no rules when %s, which the SDK does not report', async (_case, response) => {
    const fetched = await fetchSwitchRules(
      SOURCE,
      recordingProvider().provider,
      {
        fetchRules: answering(response),
        timeoutMs: 100,
      },
    )

    expect(fetched.isErr() && fetched.error).toMatchObject({
      _tag: 'SwitchRulesNotFetched',
      message: 'PostHog sent no switch rules',
    })
  })

  it('says PostHog sent no rules when it cannot be reached', async () => {
    const fetched = await fetchSwitchRules(
      SOURCE,
      recordingProvider().provider,
      {
        fetchRules: async () => {
          throw new Error('Network connection lost')
        },
        timeoutMs: 100,
      },
    )

    expect(fetched.isErr() && fetched.error).toMatchObject({
      message: 'PostHog sent no switch rules',
    })
  })

  it('says the client could not be made, when the SDK refuses the key as a project key', async () => {
    const fetched = await fetchSwitchRules(
      { ...SOURCE, secretKey: 'phc_a_project_key' },
      recordingProvider().provider,
      { fetchRules: answering(rulesResponse) },
    )

    expect(fetched.isErr() && fetched.error).toMatchObject({
      _tag: 'SwitchRulesNotFetched',
      message: 'the PostHog client could not be made',
    })
  })

  it('never names the secret key in a failure', async () => {
    const failures = await Promise.all(
      [
        answering(() => new Response('', { status: 403 })),
        answering(() => new Response('', { status: 500 })),
      ].map((fetchRules) =>
        fetchSwitchRules(SOURCE, recordingProvider().provider, {
          fetchRules,
          timeoutMs: 100,
        }),
      ),
    )

    for (const failure of failures) {
      expect(failure.isErr() && failure.error.message).not.toContain(SECRET_KEY)
    }
  })
})
