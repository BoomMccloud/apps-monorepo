import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryKv, switchRules } from '@/server/posthog/switchRules.mock'
import { SWITCH_RULES_KEY } from '@/server/posthog/switchRulesCache'
import worker from './server'

// The framework's own entry answers requests; these tests are about the Worker
// around it. Its wrapper for the entry's `fetch` hands the callback through.
const start = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: start,
  createServerEntry: <Entry>(entry: Entry): Entry => entry,
}))

const cronRun = {
  scheduledTime: 0,
  cron: '* * * * *',
  noRetry: () => {},
} satisfies ScheduledController

describe("the Manager's Worker", () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    start.fetch.mockReset()
  })

  it('answers a request through TanStack Start, which it gives the empty request context and nothing the runtime handed in', async () => {
    const request = new Request('https://manager.example/')
    const answer = new Response('page')
    start.fetch.mockResolvedValue(answer)

    await expect(worker.fetch(request)).resolves.toBe(answer)

    expect(start.fetch).toHaveBeenCalledExactlyOnceWith(request, {
      context: {},
    })
  })

  it('fails the scheduled run, so the Worker logs it, when the refresh cannot store rules', async () => {
    const { space, contents } = memoryKv()

    await expect(
      worker.scheduled(cronRun, { POSTHOG_SWITCH_RULES: space }),
    ).rejects.toMatchObject({ _tag: 'SwitchRulesRefreshFailed' })
    expect(contents().size).toBe(0)
  })

  it('ends the scheduled run without a word when the refresh stores the rules', async () => {
    const { space, contents } = memoryKv()
    const rules = switchRules()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            flags: rules.flags,
            group_type_mapping: rules.groupTypeMapping,
            cohorts: rules.cohorts,
          },
          { headers: { ETag: '"v1"' } },
        ),
      ),
    )

    await expect(
      worker.scheduled(cronRun, {
        POSTHOG_SWITCH_RULES: space,
        POSTHOG_PROJECT_SECRET_API_KEY: 'phs_secret_value',
      }),
    ).resolves.toBeUndefined()
    expect(contents().has(SWITCH_RULES_KEY)).toBe(true)
  })
})
