import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryKv, switchRules } from '@/lib/posthog/switchRules.mock'
import { SWITCH_RULES_KEY } from '@/lib/posthog/switchRulesStore'
import worker from './server'

// The framework's own entry answers requests; these tests are about the cron.
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: vi.fn() },
}))

const cronRun = {
  scheduledTime: 0,
  cron: '* * * * *',
  noRetry: () => {},
} satisfies ScheduledController

describe("the Manager's scheduled run", () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_project')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('fails, so the Worker logs it, when the refresh cannot store rules', async () => {
    const { space, contents } = memoryKv()

    await expect(
      worker.scheduled(cronRun, { POSTHOG_SWITCH_RULES: space }),
    ).rejects.toMatchObject({ _tag: 'SwitchRulesRefreshFailed' })
    expect(contents().size).toBe(0)
  })

  it('ends without a word when the refresh stores the rules', async () => {
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
