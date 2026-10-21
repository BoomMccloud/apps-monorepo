import { describe, expect, it, vi } from 'vitest'
import { switchRules } from './switchRules.mock'
import { checkSwitchRulesForBuild } from './switchRulesBuildCheck'

const SECRET_KEY = 'phs_secret_value'

const BUILD_ENV = {
  POSTHOG_PROJECT_SECRET_API_KEY: SECRET_KEY,
  VITE_PUBLIC_POSTHOG_KEY: 'phc_project',
  VITE_PUBLIC_POSTHOG_HOST: 'https://posthog.example',
}

const downloadOf = (rules = switchRules()) =>
  Response.json({ flags: rules.flags, group_type_mapping: {}, cohorts: {} })

const answering =
  (response: Response | Error) =>
  (..._args: Parameters<typeof fetch>): Promise<Response> =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)

describe('checkSwitchRulesForBuild', () => {
  it('passes when the fetched rules decide every switch, and says how many rules there are', async () => {
    const fetchRules = answering(downloadOf())

    const check = await checkSwitchRulesForBuild(BUILD_ENV, {
      isSkippedWithoutKey: false,
      fetchRules,
    })

    expect(check).toEqual({
      status: 'passed',
      message: 'switch rules ok: 3 rules decide every switch',
    })
  })

  it('fetches from the project and host of the env it is given, which is the env of the build', async () => {
    const fetchRules = vi.fn(answering(downloadOf()))

    await checkSwitchRulesForBuild(
      {
        ...BUILD_ENV,
        VITE_PUBLIC_POSTHOG_KEY: 'phc_mainnet_project',
        VITE_PUBLIC_POSTHOG_HOST: 'https://mainnet.posthog.example',
      },
      { isSkippedWithoutKey: false, fetchRules },
    )

    const [url, init] = fetchRules.mock.calls[0] ?? []
    expect(url).toBe(
      'https://mainnet.posthog.example/api/feature_flag/local_evaluation?token=phc_mainnet_project&send_cohorts',
    )
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SECRET_KEY}`,
    })
  })

  describe('without the secret key', () => {
    const withoutKey = { ...BUILD_ENV, POSTHOG_PROJECT_SECRET_API_KEY: '' }

    it('is skipped, with the reason, when the build may skip it', async () => {
      const fetchRules = vi.fn(answering(downloadOf()))

      await expect(
        checkSwitchRulesForBuild(withoutKey, {
          isSkippedWithoutKey: true,
          fetchRules,
        }),
      ).resolves.toEqual({
        status: 'skipped',
        message:
          'switch rules check skipped: POSTHOG_PROJECT_SECRET_API_KEY is not set',
      })
      expect(fetchRules).not.toHaveBeenCalled()
    })

    it('fails when the build must hold it', async () => {
      await expect(
        checkSwitchRulesForBuild(withoutKey, { isSkippedWithoutKey: false }),
      ).resolves.toEqual({
        status: 'failed',
        message:
          'POSTHOG_PROJECT_SECRET_API_KEY is not set, so the deployed Manager would have every switch off.',
      })
    })

    it('fails on a Cloudflare Workers build, which deploys, even where skipping is allowed', async () => {
      await expect(
        checkSwitchRulesForBuild(
          { ...withoutKey, WORKERS_CI: '1' },
          { isSkippedWithoutKey: true },
        ),
      ).resolves.toMatchObject({ status: 'failed' })
    })
  })

  describe('in a Storybook build', () => {
    // Storybook sets STORYBOOK=true before it loads the Vite config.
    it.each([
      ['holding the key', BUILD_ENV],
      [
        'on a Cloudflare Workers build without the key',
        { ...BUILD_ENV, POSTHOG_PROJECT_SECRET_API_KEY: '', WORKERS_CI: '1' },
      ],
    ])('is skipped, with the reason, %s, since Storybook deploys no Worker', async (_name, env) => {
      const fetchRules = vi.fn(answering(downloadOf()))

      await expect(
        checkSwitchRulesForBuild(
          { ...env, STORYBOOK: 'true' },
          { isSkippedWithoutKey: false, fetchRules },
        ),
      ).resolves.toEqual({
        status: 'skipped',
        message:
          'switch rules check skipped: a Storybook build deploys no Worker',
      })
      expect(fetchRules).not.toHaveBeenCalled()
    })

    it('leaves the check to every other build, even where the env names Storybook otherwise', async () => {
      await expect(
        checkSwitchRulesForBuild(
          {
            ...BUILD_ENV,
            POSTHOG_PROJECT_SECRET_API_KEY: '',
            WORKERS_CI: '1',
            STORYBOOK: 'false',
          },
          { isSkippedWithoutKey: true },
        ),
      ).resolves.toMatchObject({ status: 'failed' })
    })
  })

  it('fails when the env names no PostHog project or host to fetch from', async () => {
    const fetchRules = vi.fn(answering(downloadOf()))

    await expect(
      checkSwitchRulesForBuild(
        { ...BUILD_ENV, VITE_PUBLIC_POSTHOG_HOST: undefined },
        { isSkippedWithoutKey: false, fetchRules },
      ),
    ).resolves.toEqual({
      status: 'failed',
      message:
        'VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST must be set.',
    })
    expect(fetchRules).not.toHaveBeenCalled()
  })

  it('fails with what the SDK says of a refused key, which never holds the secret key', async () => {
    const check = await checkSwitchRulesForBuild(BUILD_ENV, {
      isSkippedWithoutKey: false,
      fetchRules: answering(new Response('no', { status: 401 })),
      timeoutMs: 100,
    })

    expect(check).toEqual({
      status: 'failed',
      message: expect.stringContaining(
        'PostHog sent no switch rules: ClientError: Your project key or personal API key is invalid',
      ),
    })
    expect(JSON.stringify(check)).not.toContain(SECRET_KEY)
  })

  it('fails when PostHog cannot be reached, with no more than that to say', async () => {
    const check = await checkSwitchRulesForBuild(BUILD_ENV, {
      isSkippedWithoutKey: false,
      fetchRules: answering(new Error('Network connection lost')),
      timeoutMs: 100,
    })

    expect(check).toEqual({
      status: 'failed',
      message: 'PostHog sent no switch rules',
    })
  })

  it('fails when the rules cannot decide every switch, naming what is missing', async () => {
    const withoutI18n = switchRules({ i18n: undefined })

    const check = await checkSwitchRulesForBuild(BUILD_ENV, {
      isSkippedWithoutKey: false,
      fetchRules: answering(downloadOf(withoutI18n)),
    })

    expect(check).toEqual({
      status: 'failed',
      message: expect.stringContaining('i18n: no yes or no for a wallet'),
    })
  })
})
